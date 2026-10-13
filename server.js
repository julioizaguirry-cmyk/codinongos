'use strict';
// CODINONGOS: servidor da rede local (LAN).
// Uso: node server.js  (ou clique duas vezes em iniciar.bat no Windows)
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT) || 3000;
const PAGE = path.join(__dirname, 'codinongos.html');
const CDN = 'https://cdn.jsdelivr.net/npm/socket.io-client@4.8.1/dist/socket.io.min.js';
const MAX_PLAYERS = 12, MAX_CUSTOM = 300;
const IDLE_MS = 2 * 60 * 60 * 1000, GONE_MS = 5 * 60 * 1000, HOST_GRACE_MS = 30 * 1000;
const NAME = { red: 'Vermelha', blue: 'Azul' };
const ACID = 'porra caralho merda bosta foda cu buceta puta corno babaca otário trouxa idiota cretino pau rola punheta tesão trepada bunda peido cagada mijo escroto vagabundo desgraça cacete arrombado cuzão porrada putaria sacanagem safado tarado rabo teta pentelho orgia vibrador camisinha motel chifre bundão cornudo fodido piranha galinha gemido calcinha sutiã cueca boleto ressaca sogra cunhado síndico vizinho coach influencer empreendedor pirâmide golpe fiado calote cheque penhora pix inss detran cartório fila convênio dentista terapia psicólogo remédio ansiedade cachaça pinga cerveja buteco farofa churrasco tiozão fofoca crush fantasma casamento divórcio pensão herança velório caixão coveiro cemitério lápide testamento dengue mosquito barata rato pombo gambá urubu chorume esgoto lixão enchente apagão gambiarra latrina privada bidê propina laranja lavagem mala delação pilantra tigrinho aposta fatura juros salário estágio reunião chefe demissão férias segunda domingo imposto leão carnaval novela zap áudio meme stories sertanejo pagode funk forró foguete marciano alienígena astronauta satélite sputnik cometa buraco robô laser átomo bomba nuclear radiação cápsula órbita eclipse lua saturno marte jetpack disco pílula hippie twist minissaia fusca baseado maconha fumaça paz flor bigode vitrola televisor antena radar abdução sonda gravidade vácuo estrela sol universo galáxia ovni invasão banco cobra ponta coroa planta vela pena cabo manga carta banda vaca cachorro galo coelho égua jumento burro porco urso macaco mico sapo lesma gato abelha ferrão presunto salsicha linguiça pepino banana berinjela espeto chicote algema corda grampo escuta veneno faca soco tapa tiro bala cobertor lençol colchão cama'.split(/\s+/).filter(Boolean);
const ADS = 'briefing logo campanha cliente agência orçamento prazo revisão aprovação layout slogan jingle outdoor panfleto banner marca pitch freelancer criativo refação urgente feedback cronograma rebranding engajamento'.split(' ');

// Pacotes de palavras (uma palavra cada). O anfitrião liga e desliga no lobby.
const PACKS = {
  acid: ACID,
  sexo: 'camisinha motel orgasmo fetiche swing nudes chifre vibrador lubrificante gemido libido amante ficante safadeza striptease lingerie algema chicote dominação submisso ereção sexting pornô orgia fantasia viagra preliminares virgindade traição pelada sensual cantada sarrada pegação peladão gostosão bumbum fio-dental camarote suruba beijaço'.split(' '),
  politica: 'urna voto eleição deputado senador prefeito governador ministro corrupção propina mensalão impeachment golpe ditadura democracia comunismo capitalismo socialismo esquerda direita centrão lobby mandato campanha comício carreata boato imposto reforma orçamento emenda cassação delação plenário palanque eleitor partido coligação plebiscito anistia militância panelaço cabresto privilégio auxílio fundão jatinho rachadinha vereador candidato'.split(' '),
  polemica: 'aborto maconha cassino apostas tigrinho eutanásia cotas feminismo machismo cancelamento lacração armas desarmamento vape religião ateu astrologia terraplanista vacina negacionista divórcio pensão herança sonegação pirataria gambiarra fofoca traíra dedo-duro monogamia poligamia celibato jejum seita pastor horóscopo influencer bullying clonagem tatuagem sertanejo funk'.split(' '),
  engracadas: 'pamonha cuecão chinelada mortadela farofa tiozão sogra cunhado rodízio mico fiasco tropeço bafo churrasqueira espirro soluço cócegas lambança xororô pelado careca barrigudo sunga bigode peruca zoeira trollagem meme gambá galinha pinguim jegue cabrito chupa-cabra sapatênis crocs pijama pudim abacaxi ketchup coentro biscoito pão-de-queijo rolê perrengue gororoba fedor chulé'.split(' ').concat(['coq au vin']),
};
const PACK_KEYS = Object.keys(PACKS);


const rooms = new Map();
const OK = { ok: true };
const err = (error, code = 'INVALID') => ({ ok: false, error, code });
const other = (t) => (t === 'red' ? 'blue' : 'red');
const token = (n) => crypto.randomBytes(n).toString('hex');
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const cleanNick = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 16);
const isHost = (rm, p) => p.id === rm.hostId;
const ev = (rm, type, text, extra = {}) => { rm.events.push({ id: ++rm.evId, type, text, ...extra }); if (rm.events.length > 80) rm.events.shift(); };
const decide = (rm, p, g) => p.team === g.activeTeam && !p.spymaster;
const devPl = (rm, pl) => (rm.dev && isHost(rm, pl) && rm.game && rm.game.phase !== 'over'
  ? { ...pl, team: rm.game.activeTeam, spymaster: rm.game.phase === 'clue' } : pl);
const lobbyOnly = (rm) => (rm.game && rm.game.phase !== 'over' ? err('Isso só pode ser mudado no lobby.') : null);

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) { let c = ''; for (let i = 0; i < 5; i++) c += A[crypto.randomInt(A.length)]; if (!rooms.has(c)) return c; }
}

// ---------- palavras ----------
function pickWords(rm) {
  const uniq = (a) => shuffle([...new Set(a)]);
  if (rm.config.onlyCustomWords) return uniq(rm.custom).slice(0, 25);
  const ads = uniq(ADS), nAds = { advertising: 10, random: 0, balanced: 4 }[rm.config.wordMix] || 0;
  const picked = ads.slice(0, nAds);
  const base = uniq([...(rm.config.packs || PACK_KEYS).flatMap((k) => PACKS[k] || []), ...rm.custom]);
  for (const w of base.length >= 25 ? base : uniq([...base, ...ads.slice(nAds)])) { if (picked.length >= 25) break; if (!picked.includes(w)) picked.push(w); }
  return shuffle(picked);
}

// ---------- regras ----------
function startGame(rm) {
  const first = crypto.randomInt(2) ? 'red' : 'blue';
  const ids = shuffle([...Array(9).fill(first), ...Array(8).fill(other(first)), ...Array(7).fill('neutral'), 'assassin']);
  rm.game = {
    cards: pickWords(rm).map((w, i) => ({ index: i, word: w, identity: ids[i], revealed: false })),
    activeTeam: first, turn: 1, phase: 'clue', clue: null, guessesMade: 0, guessesAllowed: 0,
    remaining: { [first]: 9, [other(first)]: 8 }, lastRevealed: null, marks: {}, vote: null, tie: null, winner: null, winReason: null,
    stats: { turns: 1, correct: 0, wrong: 0, neutral: 0, bestStreak: 0, streak: 0, startedAt: Date.now(), endedAt: null },
  };
  ev(rm, 'start', `Partida iniciada. A equipe ${NAME[first]} começa com 9 agentes (8 + o agente duplo).`);
  ev(rm, 'turn', `Vez da equipe ${NAME[first]}.`, { team: first });
}
function endTurn(rm) {
  const g = rm.game; clearTimeout(rm.timer);
  g.activeTeam = other(g.activeTeam); g.turn++; g.stats.turns++; g.stats.streak = 0;
  Object.assign(g, { phase: 'clue', clue: null, guessesMade: 0, guessesAllowed: 0, marks: {}, vote: null, tie: null });
  ev(rm, 'turn', `Vez da equipe ${NAME[g.activeTeam]}.`, { team: g.activeTeam });
}
function win(rm, team, reason) {
  const g = rm.game; clearTimeout(rm.timer);
  Object.assign(g, { phase: 'over', winner: team, winReason: reason }); g.stats.endedAt = Date.now();
  ev(rm, 'win', `A equipe ${NAME[team]} venceu!`, { team });
}
function reveal(rm, i) {
  const g = rm.game, c = g.cards[i], t = g.activeTeam, s = g.stats;
  if (!c || c.revealed) return err('Essa carta já foi revelada.');
  clearTimeout(rm.timer);
  c.revealed = true; Object.assign(g, { lastRevealed: i, marks: {}, tie: null, vote: null });
  if (c.identity === 'assassin') { s.streak = 0; ev(rm, 'assassin', `Equipe ${NAME[t]} revelou o assassino (${c.word}).`, { index: i, team: t }); win(rm, other(t), 'assassin'); return OK; }
  if (c.identity === 'neutral') { s.neutral++; s.streak = 0; ev(rm, 'neutral', `${c.word} era inocente.`, { index: i }); endTurn(rm); return OK; }
  g.remaining[c.identity]--;
  if (c.identity === t) { s.correct++; s.bestStreak = Math.max(s.bestStreak, ++s.streak); g.guessesMade++; ev(rm, 'correct', `Acerto: ${c.word}.`, { index: i, team: t }); }
  else { s.wrong++; s.streak = 0; ev(rm, 'wrong', `${c.word} era da equipe ${NAME[c.identity]}.`, { index: i, team: c.identity }); }
  if (g.remaining[c.identity] === 0) { win(rm, c.identity, 'all'); return OK; }
  if (c.identity !== t || g.guessesMade >= g.guessesAllowed) endTurn(rm);
  else { g.phase = 'guessing'; if (rm.config.voteMode === 'vote') openVote(rm); }
  return OK;
}
function openVote(rm, candidates = null) {
  const g = rm.game, sec = rm.config.voteTimerSec; clearTimeout(rm.timer);
  g.vote = { open: true, votes: {}, candidates, deadline: sec ? Date.now() + sec * 1000 : 0 };
  if (!sec) return;
  rm.timer = setTimeout(() => {
    if (rooms.get(rm.code) !== rm || !rm.game || !rm.game.vote || !rm.game.vote.open) return;
    if (!resolveVote(rm).ok) openVote(rm, rm.game.vote.candidates);
    push(rm);
  }, sec * 1000);
}
function resolveVote(rm) {
  const g = rm.game, counts = {};
  Object.values(g.vote.votes).forEach((i) => { counts[i] = (counts[i] || 0) + 1; });
  const max = Math.max(0, ...Object.values(counts));
  if (!max) return err('Ninguém votou ainda.');
  const top = Object.keys(counts).filter((i) => counts[i] === max).map(Number);
  if (top.length > 1) {
    clearTimeout(rm.timer); g.vote.open = false; g.phase = 'tiebreak'; g.tie = top;
    ev(rm, 'tie', `Empate: ${top.map((i) => g.cards[i].word).join(', ')}.`); return OK;
  }
  return reveal(rm, top[0]);
}
function readiness(rm) {
  const rd = { teams: {}, wordsProblem: '' };
  for (const t of ['red', 'blue']) rd.teams[t] = { spymasterOnline: rm.players.some((x) => x.team === t && x.spymaster && x.connected), operativesOnline: rm.players.filter((x) => x.team === t && !x.spymaster && x.connected).length };
  if (rm.config.onlyCustomWords && rm.custom.length < 25) rd.wordsProblem = 'Faltam palavras personalizadas (mínimo 25).';
  rd.dev = !!rm.dev;
  rd.canStart = (rm.dev || ['red', 'blue'].every((t) => rd.teams[t].spymasterOnline && rd.teams[t].operativesOnline >= 1)) && !rd.wordsProblem;
  return rd;
}

// ---------- visão por jogador (só o Mestre Espião vê as identidades) ----------
function viewFor(rm, pl) {
  const pe = devPl(rm, pl);
  const g = rm.game; let game = null;
  if (g) {
    const sees = pe.spymaster || g.phase === 'over' || (rm.dev && isHost(rm, pl)), v = g.vote; let vote = null;
    if (v) {
      const tallies = {};
      for (const [id, idx] of Object.entries(v.votes)) { const p = rm.players.find((x) => x.id === id); if (p) (tallies[idx] = tallies[idx] || []).push({ id, nick: p.nick }); }
      vote = { open: v.open, tallies, candidates: v.candidates, mine: v.votes[pl.id] === undefined ? null : v.votes[pl.id], remainingMs: v.deadline ? Math.max(0, v.deadline - Date.now()) : null };
    }
    game = { phase: g.phase, activeTeam: g.activeTeam, turn: g.turn, remaining: g.remaining, clue: g.clue, guessesMade: g.guessesMade, guessesAllowed: g.guessesAllowed,
      cards: g.cards.map((c) => ({ index: c.index, word: c.word, revealed: c.revealed, identity: c.revealed || sees ? c.identity : undefined })),
      seesIdentities: sees, lastRevealed: g.lastRevealed, vote, marks: g.marks, tie: g.tie, winner: g.winner, winReason: g.winReason, stats: g.stats };
  }
  return { code: rm.code, config: rm.config, readiness: readiness(rm), customWords: rm.custom.length, limits: { customWordsMax: MAX_CUSTOM, maxPlayers: MAX_PLAYERS },
    players: rm.players.map((x) => ({ id: x.id, nick: x.nick, team: x.team, spymaster: x.spymaster, host: x.id === rm.hostId, connected: x.connected })),
    dev: !!rm.dev, you: { id: pl.id, nick: pl.nick, team: pe.team, isSpymaster: pe.spymaster, isHost: isHost(rm, pl) }, events: rm.events, chat: rm.chat.filter((m) => m.scope === 'all' || (pl.team && m.team === pl.team)), game };
}
function push(rm) {
  for (const p of rm.players) { if (p.sock && p.connected) { try { p.sock.emit('state', viewFor(rm, p)); } catch (e) { console.error(e); } } }
}

// ---------- salas e jogadores ----------
function setHost(rm, id) {
  rm.hostId = id; const p = rm.players.find((x) => x.id === id);
  if (p) ev(rm, 'host', `${p.nick} agora é o anfitrião.`);
}
function closeRoom(rm, reason) {
  clearTimeout(rm.timer);
  for (const p of rm.players) if (p.sock) { p.sock.emit('room:closed', { reason }); p.sock.data.code = null; }
  rooms.delete(rm.code);
}
function removePlayer(rm, pl) {
  rm.players = rm.players.filter((x) => x !== pl);
  if (pl.sock) { pl.sock.data.code = null; pl.sock = null; }
  if (!rm.players.length) { clearTimeout(rm.timer); rooms.delete(rm.code); return; }
  ev(rm, 'leave', `${pl.nick} saiu da sala.`);
  if (pl.id === rm.hostId) setHost(rm, (rm.players.find((x) => x.connected) || rm.players[0]).id);
  push(rm);
}
function leaveCurrent(sock) {
  const rm = rooms.get(sock.data.code), pl = rm && rm.players.find((p) => p.id === sock.data.pid);
  sock.data.code = null;
  if (rm && pl && pl.sock === sock) removePlayer(rm, pl);
}
function attach(rm, pl, sock) {
  if (pl.sock && pl.sock !== sock) { pl.sock.emit('session:replaced'); pl.sock.data.code = null; }
  Object.assign(pl, { sock, connected: true, goneAt: 0 });
  sock.data.code = rm.code; sock.data.pid = pl.id;
}
const mkPlayer = (nick, tk) => ({ id: token(6), token: typeof tk === 'string' && tk.length >= 16 ? tk : token(12), nick, team: null, spymaster: false, connected: true, sock: null, goneAt: 0 });

// ---------- ações vindas dos clientes ----------
const inRoom = (fn) => (sock, d) => {
  const rm = rooms.get(sock.data.code), pl = rm && rm.players.find((p) => p.id === sock.data.pid);
  if (!rm || !pl || pl.sock !== sock) return err('Você não está em uma sala.', 'NOT_FOUND');
  return fn(rm, pl, d, sock);
};
const gameRoom = (fn) => inRoom((rm, pl, d, sock) => fn(rm, devPl(rm, pl), d, sock));
const hostOnly = (fn) => inRoom((rm, pl, d, sock) => (isHost(rm, pl) ? fn(rm, pl, d, sock) : err('Só o anfitrião pode fazer isso.', 'FORBIDDEN')));

const ACTIONS = {
  'room:create': (sock, d) => {
    const nick = cleanNick(d.nick); if (!nick) return err('Digite um apelido (até 16 caracteres).');
    leaveCurrent(sock);
    const rm = { code: newCode(), hostId: null, players: [], custom: [], events: [], evId: 0, game: null, timer: null, lastActive: Date.now(),
      chat: [], chatId: 0, config: { packs: PACK_KEYS.slice(), voteMode: 'classic', voteTimerSec: 0, wordMix: 'balanced', lateJoin: 'spectator', onlyCustomWords: false } };
    const pl = mkPlayer(nick, d.token); rm.players.push(pl); rm.hostId = pl.id; rooms.set(rm.code, rm); attach(rm, pl, sock);
    ev(rm, 'join', `${nick} criou a sala.`);
    return { ok: true, code: rm.code, token: pl.token };
  },
  'room:join': (sock, d) => {
    const rm = rooms.get(String(d.code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
    if (!rm) return err('Sala não encontrada.', 'NOT_FOUND');
    let pl = typeof d.token === 'string' ? rm.players.find((p) => p.token === d.token) : null;
    if (pl) { if (sock.data.code && sock.data.code !== rm.code) leaveCurrent(sock); attach(rm, pl, sock); return { ok: true, code: rm.code, token: pl.token }; }
    const nick = cleanNick(d.nick); if (!nick) return err('Digite um apelido (até 16 caracteres).');
    if (rm.players.length >= MAX_PLAYERS) return err('A sala está cheia.');
    if (rm.players.some((p) => p.nick.toLowerCase() === nick.toLowerCase())) return err('Esse apelido já está em uso nesta sala.');
    leaveCurrent(sock);
    pl = mkPlayer(nick, d.token);
    if (rm.game && rm.game.phase !== 'over' && rm.config.lateJoin === 'player') {
      const n = (t) => rm.players.filter((x) => x.team === t).length; pl.team = n('red') <= n('blue') ? 'red' : 'blue';
    }
    rm.players.push(pl); attach(rm, pl, sock); ev(rm, 'join', `${nick} entrou na sala.`);
    return { ok: true, code: rm.code, token: pl.token };
  },
  'room:leave': (sock) => { leaveCurrent(sock); return OK; },
  'player:team': inRoom((rm, pl, d) => {
    const bad = lobbyOnly(rm); if (bad) return bad;
    const t = d.team === 'red' || d.team === 'blue' ? d.team : null;
    if (pl.team !== t) pl.spymaster = false;
    pl.team = t; ev(rm, 'team', t ? `${pl.nick} entrou na equipe ${NAME[t]}.` : `${pl.nick} virou espectador.`); return OK;
  }),
  'player:role': inRoom((rm, pl, d) => {
    const bad = lobbyOnly(rm); if (bad) return bad;
    if (!pl.team) return err('Entre numa equipe primeiro.');
    if (d.role === 'spymaster') {
      if (d.on && rm.players.some((x) => x.team === pl.team && x.spymaster && x !== pl)) return err('A equipe já tem Mestre Espião.');
      pl.spymaster = !!d.on;
    } else return err('Papel desconhecido.');
    return OK;
  }),
  'host:config': hostOnly((rm, pl, d) => {
    const bad = lobbyOnly(rm); if (bad) return bad;
    const c = d.config || {}, cf = rm.config;
    if (Array.isArray(c.packs)) { const ks = [...new Set(c.packs.filter((k) => PACKS[k]))]; if (ks.length) cf.packs = ks; }
    if (!rm.dev && ['classic', 'vote'].includes(c.voteMode)) cf.voteMode = c.voteMode;
    if ([0, 15, 30, 60].includes(c.voteTimerSec)) cf.voteTimerSec = c.voteTimerSec;
    if (['balanced', 'advertising', 'random'].includes(c.wordMix)) cf.wordMix = c.wordMix;
    if (['spectator', 'player'].includes(c.lateJoin)) cf.lateJoin = c.lateJoin;
    if (typeof c.onlyCustomWords === 'boolean') cf.onlyCustomWords = c.onlyCustomWords;
    return OK;
  }),
  'host:words': hostOnly((rm, pl, d) => {
    const rep = { added: 0, duplicates: 0, invalid: [], limitReached: false };
    if (d.mode === 'clear' || d.mode === 'replace') rm.custom = [];
    if (d.mode === 'clear') return { ok: true, report: rep };
    if (d.mode !== 'add' && d.mode !== 'replace') return err('Modo desconhecido.');
    for (const w of String(d.text || '').slice(0, 20000).split(/[\n,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)) {
      if (!/^[\p{L}\p{N}'-]{2,18}$/u.test(w)) rep.invalid.push(w);
      else if (rm.custom.includes(w)) rep.duplicates++;
      else if (rm.custom.length >= MAX_CUSTOM) rep.limitReached = true;
      else { rm.custom.push(w); rep.added++; }
    }
    return { ok: true, report: rep };
  }),
  'chat:send': inRoom((rm, pl, d) => {
    const text = String(d.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!text) return err('Digite uma mensagem.');
    const now = Date.now(); if (now - (pl.lastChat || 0) < 600) return err('Calma! Espere um instante para mandar outra mensagem.');
    pl.lastChat = now;
    rm.chat.push({ id: ++rm.chatId, nick: pl.nick, team: pl.team, scope: d.scope === 'team' && pl.team ? 'team' : 'all', text, t: now });
    if (rm.chat.length > 100) rm.chat.shift();
    return OK;
  }),
  'host:dev': hostOnly((rm, pl, d) => {
    rm.dev = typeof d.on === 'boolean' ? d.on : !rm.dev;
    if (rm.dev) rm.config.voteMode = 'classic';
    ev(rm, 'dev', rm.dev ? 'Modo dev ligado: o anfitrião controla as duas equipes e vê todas as cartas.' : 'Modo dev desligado.');
    return OK;
  }),
  'host:transfer': hostOnly((rm, pl, d) => { const t = rm.players.find((x) => x.id === d.playerId); if (!t) return err('Escolha um jogador.'); setHost(rm, t.id); return OK; }),
  'host:start': hostOnly((rm) => {
    if (rm.game && rm.game.phase !== 'over') return err('A partida já começou.');
    const rd = readiness(rm); if (!rd.canStart) return err(rd.wordsProblem || 'Cada equipe precisa de um Mestre Espião e de mais um integrante.');
    startGame(rm); return OK;
  }),
  'host:restart': hostOnly((rm) => { clearTimeout(rm.timer); rm.game = null; return OK; }),
  'host:end': hostOnly((rm) => { closeRoom(rm, 'host'); return OK; }),
  'game:clue': gameRoom((rm, pl, d) => {
    const g = rm.game, w = String(d.word || '').trim(), n = Number(d.number);
    if (!g || g.phase !== 'clue' || !pl.spymaster || pl.team !== g.activeTeam) return err('Agora não é a sua vez de dar dica.');
    if (!w || /\s/.test(w) || w.length > 20) return err('A dica deve ter UMA palavra.');
    if (g.cards.some((c) => !c.revealed && c.word.toLowerCase() === w.toLowerCase())) return err('A dica não pode ser uma palavra do tabuleiro.');
    if (!Number.isInteger(n) || n < 0 || n > 9) return err('O número vai de 0 a 9.');
    Object.assign(g, { clue: { team: g.activeTeam, word: w, number: n }, guessesMade: 0, guessesAllowed: n === 0 ? 25 : n + 1, phase: 'guessing', marks: {}, tie: null, vote: null });
    ev(rm, 'clue', `Dica da equipe ${NAME[g.activeTeam]}: ${w} (${n}).`, { team: g.activeTeam });
    if (rm.config.voteMode === 'vote') openVote(rm);
    return OK;
  }),
  'game:mark': gameRoom((rm, pl, d) => {
    const g = rm.game; if (!g || g.phase !== 'guessing' || pl.team !== g.activeTeam || pl.spymaster) return err('Você não pode sugerir agora.');
    if (!g.cards[d.index] || g.cards[d.index].revealed) return err('Carta inválida.');
    const l = (g.marks[d.index] = g.marks[d.index] || []), k = l.findIndex((x) => x.id === pl.id);
    if (k >= 0) l.splice(k, 1); else l.push({ id: pl.id, nick: pl.nick }); return OK;
  }),
  'game:confirm': gameRoom((rm, pl, d) => {
    const g = rm.game; if (!g || g.phase !== 'guessing' || !decide(rm, pl, g)) return err('Só os integrantes da equipe da vez confirmam palpites.');
    if (rm.config.voteMode === 'vote') return err('Neste modo a equipe vota; use a votação.');
    return reveal(rm, d.index);
  }),
  'game:endTurn': gameRoom((rm, pl) => {
    const g = rm.game; if (!g || g.phase === 'over' || !(decide(rm, pl, g) || isHost(rm, pl))) return err('Você não pode encerrar o turno.');
    endTurn(rm); return OK;
  }),
  'game:vote': gameRoom((rm, pl, d) => {
    const g = rm.game; if (!g || g.phase !== 'guessing' || !g.vote || !g.vote.open) return err('Não há votação aberta.');
    if (pl.team !== g.activeTeam || pl.spymaster) return err('Só os integrantes da equipe da vez votam.');
    if (d.index === null || d.index === undefined) delete g.vote.votes[pl.id];
    else {
      const c = g.cards[d.index]; if (!c || c.revealed) return err('Carta inválida.');
      if (g.vote.candidates && !g.vote.candidates.includes(d.index)) return err('Essa palavra não está na votação.');
      g.vote.votes[pl.id] = d.index;
    }
    const voters = rm.players.filter((x) => x.team === g.activeTeam && !x.spymaster && x.connected);
    return voters.every((x) => g.vote.votes[x.id] !== undefined) ? resolveVote(rm) : OK;
  }),
  'game:closeVote': gameRoom((rm, pl) => {
    const g = rm.game; if (!g || !g.vote || !g.vote.open || !decide(rm, pl, g)) return err('Você não pode encerrar a votação.');
    return resolveVote(rm);
  }),
  'game:revote': gameRoom((rm, pl) => {
    const g = rm.game; if (!g || g.phase !== 'tiebreak' || !decide(rm, pl, g)) return err('Não há empate para votar de novo.');
    const c = g.tie; g.phase = 'guessing'; g.tie = null; openVote(rm, c); return OK;
  }),
  'game:decideTie': gameRoom((rm, pl, d) => {
    const g = rm.game; if (!g || g.phase !== 'tiebreak' || !decide(rm, pl, g) || !g.tie.includes(d.index)) return err('Escolha uma das palavras empatadas.');
    return reveal(rm, d.index);
  }),
};

// ---------- HTTP + socket.io ----------
function lanIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if ((i.family === 'IPv4' || i.family === 4) && !i.internal) out.push(i.address);
  const pri = (ip) => (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) ? 0 : 1);
  return out.sort((a, b) => pri(a) - pri(b));
}

const server = http.createServer((req, res) => {
  const [url, query] = req.url.split('?');
  if (url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' }); return res.end('ok'); }
  if (url === '/api/network') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ ips: lanIps(), port: PORT }));
  }
  if (url === '/') { res.writeHead(302, { Location: '/codinongos.html' + (query ? '?' + query : '') }); return res.end(); }
  if (url === '/codinongos.html') {
    return fs.readFile(PAGE, 'utf8', (e, html) => {
      if (e) { res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('codinongos.html não está na mesma pasta do server.js'); }
      // usa o socket.io servido por este próprio servidor (funciona sem internet)
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html.replace(CDN, '/socket.io/socket.io.js'));
    });
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Não encontrado');
});

const io = new Server(server, { cors: { origin: '*' } });
io.on('connection', (sock) => {
  sock.data = { code: null, pid: null };
  const seen = new Map();
  for (const name of Object.keys(ACTIONS)) {
    sock.on(name, (payload, ack) => {
      const done = typeof ack === 'function' ? ack : () => {};
      const d = payload && typeof payload === 'object' ? payload : {};
      if (d.reqId && seen.has(d.reqId)) return done(seen.get(d.reqId));
      let res;
      try { res = ACTIONS[name](sock, d); } catch (e) { console.error(e); res = err('Erro interno do servidor.', 'INTERNAL'); }
      if (d.reqId) { seen.set(d.reqId, res); if (seen.size > 50) seen.delete(seen.keys().next().value); }
      done(res);
      const rm = rooms.get(sock.data.code); if (rm) { rm.lastActive = Date.now(); push(rm); }
    });
  }
  sock.on('disconnect', () => {
    const rm = rooms.get(sock.data.code), pl = rm && rm.players.find((p) => p.id === sock.data.pid);
    if (rm && pl && pl.sock === sock) { Object.assign(pl, { connected: false, goneAt: Date.now(), sock: null }); push(rm); }
  });
});

setInterval(() => {
  const now = Date.now();
  for (const rm of [...rooms.values()]) {
    for (const p of [...rm.players]) if (!p.connected && now - p.goneAt > GONE_MS && rooms.has(rm.code)) removePlayer(rm, p);
    if (!rooms.has(rm.code)) continue;
    const host = rm.players.find((p) => p.id === rm.hostId);
    if (host && !host.connected && now - host.goneAt > HOST_GRACE_MS) {
      const nx = rm.players.find((p) => p.connected); if (nx) { setHost(rm, nx.id); push(rm); }
    }
    if (now - rm.lastActive > IDLE_MS) closeRoom(rm, 'idle');
  }
}, 10000).unref();

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  CODINONGOS: servidor da rede local no ar\n');
  console.log(`  Neste PC:        http://localhost:${PORT}/codinongos.html`);
  console.log('  Para jogar pela página do Neocities: rode um túnel https (iniciar-online.bat) e cole o endereço no campo Servidor.');
  for (const ip of lanIps()) console.log(`  Outros PCs (rede): http://${ip}:${PORT}/codinongos.html`);
  console.log('\n  Para encerrar, feche esta janela ou aperte Ctrl+C.\n');
});
server.on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `A porta ${PORT} já está em uso. Feche o outro servidor ou rode com PORT=3001.` : e); process.exit(1); });
