import { db } from "./firebase";
import { doc, setDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, Trophy, Shield, Snowflake, Flame, Sparkles } from "lucide-react";
import "./App.css";

const TARGET_SCORE = 200;
const FLIP_7_BONUS = 15;

type GameCard = {
  type: "number" | "bonus" | "second" | "freeze" | "flipThree";
  number?: number;
  label: string;
  value: number;
  text?: string;
  multiplier?: number;
};

type Player = {
  name: string;
  score: number;
  cards: GameCard[];
  actionCards: GameCard[];
  secondChance: boolean;
  status: "active" | "stayed" | "busted" | "frozen";
};

type FinalResult = {
  winner: string;
  loser: string;
  winnerScore: number;
  loserScore: number;
};

function shuffle(array: GameCard[]) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildDeck() {
  const deck: GameCard[] = [];

  deck.push({ type: "number", number: 0, label: "0", value: 0 });

  for (let number = 1; number <= 12; number++) {
    for (let count = 0; count < number; count++) {
      deck.push({ type: "number", number, label: String(number), value: number });
    }
  }

  [2, 4, 6, 8, 10].forEach((value) => {
    deck.push({ type: "bonus", label: `+${value}`, value, text: `Bonus +${value}` });
  });

  deck.push({ type: "bonus", label: "x2", value: 0, multiplier: 2, text: "Doppelter Bonus" });

  for (let i = 0; i < 3; i++) {
    deck.push({ type: "second", label: "2nd", value: 0, text: "Second Chance" });
    deck.push({ type: "freeze", label: "Freeze", value: 0, text: "FREEZE" });
    deck.push({ type: "flipThree", label: "Flip 3", value: 0, text: "Drei Karten ziehen" });
  }

  return shuffle(deck);
}

function createPlayers(): Player[] {
  return [
    { name: "Dion", score: 0, cards: [], actionCards: [], secondChance: false, status: "active" },
    { name: "Franzi", score: 0, cards: [], actionCards: [], secondChance: false, status: "active" },
  ];
}

function uniqueNumberCount(player: Player) {
  return new Set(player.cards.filter((card) => card.type === "number").map((card) => card.number)).size;
}

function roundPoints(player: Player) {
  const numberPoints = player.cards
    .filter((card) => card.type === "number")
    .reduce((sum, card) => sum + (card.value || 0), 0);

  const bonusPoints = player.cards
    .filter((card) => card.type === "bonus" && !card.multiplier)
    .reduce((sum, card) => sum + (card.value || 0), 0);

  const multiplier = player.cards.some((card) => card.multiplier === 2) ? 2 : 1;

  return numberPoints * multiplier + bonusPoints;
}

function activePlayerIndexes(players: Player[]) {
  return players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => player.status === "active")
    .map(({ index }) => index);
}

function nextActiveIndex(players: Player[], currentIndex: number) {
  const activeIndexes = activePlayerIndexes(players);
  if (activeIndexes.length === 0) return currentIndex;
  const currentPosition = activeIndexes.indexOf(currentIndex);
  if (currentPosition === -1 || currentPosition === activeIndexes.length - 1) return activeIndexes[0];
  return activeIndexes[currentPosition + 1];
}

function GameButton({ children, onClick, disabled, variant = "primary" }: any) {
  return (
    <button className={`game-button ${variant}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function CardTile({ card }: { card: GameCard }) {
  const icon =
    card.type === "second" ? (
      <Shield size={16} />
    ) : card.type === "freeze" ? (
      <Snowflake size={16} />
    ) : card.type === "flipThree" ? (
      <Flame size={16} />
    ) : (
      <Sparkles size={16} />
    );

  const cardClass =
    card.type === "number"
      ? "number-card"
      : card.type === "bonus"
      ? "bonus-card"
      : card.type === "freeze"
      ? "freeze-card"
      : card.type === "flipThree"
      ? "flip-card"
      : "second-card";

  return (
    <motion.div
      initial={{ scale: 0.75, rotate: -5, opacity: 0 }}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      className={`playing-card ${cardClass}`}
    >
      <div className="card-label">{card.label}</div>
      <div className="card-type">{card.type === "number" ? "Zahl" : card.text}</div>
      {card.type !== "number" && <div className="card-icon">{icon}</div>}
    </motion.div>
  );
}

function PlayerPanel({ player, active, winner }: { player: Player; active: boolean; winner: boolean }) {
  const statusLabel =
    player.status === "active"
      ? "Aktiv"
      : player.status === "stayed"
      ? "Gesichert"
      : player.status === "busted"
      ? "Bust"
      : "Eingefroren";

  return (
    <div className={`panel player-panel ${active ? "active-panel" : ""}`}>
      <div className="panel-header">
        <div>
          <p className="eyebrow">Spieler</p>
          <h2>{player.name}</h2>
          <p className="muted">{statusLabel}</p>
        </div>
        {winner && <Trophy size={30} />}
      </div>

      <div className="stats-grid">
        <div className="stat-box">
          <span>Gesamt</span>
          <strong>{player.score}</strong>
        </div>
        <div className="stat-box">
          <span>Runde</span>
          <strong>{roundPoints(player)}</strong>
        </div>
        <div className="stat-box">
          <span>Karten</span>
          <strong>{uniqueNumberCount(player)}/7</strong>
        </div>
      </div>

      {player.secondChance && <p className="second-chance">Second Chance bereit</p>}
    </div>
  );
}

export default function App() {
  const [players, setPlayers] = useState<Player[]>(createPlayers);
  const [deck, setDeck] = useState<GameCard[]>(buildDeck);
  const [active, setActive] = useState(0);
  const [startingPlayer, setStartingPlayer] = useState(0);
  const [message, setMessage] = useState("Dion beginnt. Ziehe eine Karte oder sichere deine Punkte.");
  const [gameOver, setGameOver] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ card: GameCard; fromIndex: number } | null>(null);
  const [roundNumber, setRoundNumber] = useState(1);
  const [eventBanner, setEventBanner] = useState<string | null>(null);
  const [roundSummary, setRoundSummary] = useState<string | null>(null);
  const [finalResult, setFinalResult] = useState<FinalResult | null>(null);
  const [gameLog, setGameLog] = useState<string[]>([]);
  const [roomCode, setRoomCode] = useState("");
const [connectedRoom, setConnectedRoom] = useState<string | null>(null);
const [isOnlineGame, setIsOnlineGame] = useState(false);
const [myPlayerIndex, setMyPlayerIndex] = useState<number | null>(null);

  const winner = finalResult ? players.find((player) => player.name === finalResult.winner) : null;
  const current = players[active];
  const activeIndexes = activePlayerIndexes(players);
  useEffect(() => {
    if (!connectedRoom) return;
  
    const unsubscribe = onSnapshot(doc(db, "games", connectedRoom), (snapshot) => {
      const data = snapshot.data();
  
      if (!data) return;
  
      setPlayers(data.players || []);
      setDeck(data.deck || []);
      setActive(data.active || 0);
      setStartingPlayer(data.startingPlayer || 0);
      setMessage(data.message || "");
      setGameOver(data.gameOver || false);
      setPendingAction(data.pendingAction || null);
      setRoundNumber(data.roundNumber || 1);
      setRoundSummary(data.roundSummary || null);
      setFinalResult(data.finalResult || null);
      setGameLog(data.gameLog || []);
    });
  
    return () => unsubscribe();
  }, [connectedRoom]);
  useEffect(() => {
    if (!connectedRoom || !isOnlineGame) return;
  
    updateDoc(doc(db, "games", connectedRoom), {
      players,
      deck,
      active,
      startingPlayer,
      message,
      gameOver,
      pendingAction,
      roundNumber,
      roundSummary,
      finalResult,
      gameLog,
    });
  }, [
    players,
    deck,
    active,
    startingPlayer,
    message,
    gameOver,
    pendingAction,
    roundNumber,
    roundSummary,
    finalResult,
    gameLog,
    connectedRoom,
    isOnlineGame,
  ]);
  async function createOnlineGame() {
    const code = `FLIP-${Math.floor(1000 + Math.random() * 9000)}`;
  
    await setDoc(doc(db, "games", code), {
      players,
      deck,
      active,
      startingPlayer,
      message,
      gameOver,
      pendingAction,
      roundNumber,
      roundSummary,
      finalResult,
      gameLog,
      createdAt: new Date().toISOString(),
    });
  
    setRoomCode(code);
    setConnectedRoom(code);
    setIsOnlineGame(true);
    addLog(`Online-Spiel erstellt: ${code}`);
  }
  
  function joinOnlineGame() {
    if (!roomCode.trim()) return;
  
    const code = roomCode.trim().toUpperCase();
    setConnectedRoom(code);
    setIsOnlineGame(true);
    addLog(`Online-Spiel beigetreten: ${code}`);
  }
  function addLog(entry: string) {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    setGameLog((previous) => [`[${timestamp}] ${entry}`, ...previous].slice(0, 18));
  }

  function showEvent(text: string) {
    setEventBanner(text);
    setTimeout(() => setEventBanner(null), 1300);
  }

  function takeCardFromDeck(deckOverride = deck) {
    let workingDeck = deckOverride.length ? [...deckOverride] : buildDeck();
    const card = workingDeck.pop() as GameCard;
    return { card, newDeck: workingDeck };
  }

  function applySecondChanceRule(updatedPlayers: Player[], drawerIndex: number) {
    const updated = [...updatedPlayers];
    const drawer = { ...updated[drawerIndex], actionCards: [...updated[drawerIndex].actionCards] };
    const otherIndex = drawerIndex === 0 ? 1 : 0;
    const other = { ...updated[otherIndex], actionCards: [...updated[otherIndex].actionCards] };
    const secondChanceCard: GameCard = { type: "second", label: "2nd", value: 0, text: "Second Chance" };

    if (!drawer.secondChance) {
      drawer.secondChance = true;
      drawer.actionCards.push(secondChanceCard);
      updated[drawerIndex] = drawer;
      return { players: updated, message: `${drawer.name} zieht eine Second Chance und behält sie.` };
    }

    if (!other.secondChance) {
      other.secondChance = true;
      other.actionCards.push(secondChanceCard);
      updated[drawerIndex] = drawer;
      updated[otherIndex] = other;
      return { players: updated, message: `${drawer.name} hat bereits eine Second Chance, daher erhält ${other.name} sie.` };
    }

    updated[drawerIndex] = drawer;
    updated[otherIndex] = other;
    return { players: updated, message: "Beide Spieler haben bereits eine Second Chance. Die Karte wird abgeworfen." };
  }

  function finishRound(updatedPlayers: Player[], reason: string) {
    const summaryText = updatedPlayers
      .map((player) => {
        const points = player.status === "busted" ? 0 : roundPoints(player);
        return `${player.name}: +${points} Punkte`;
      })
      .join(" | ");

    setRoundSummary(summaryText);
    addLog(`Runde ${roundNumber} beendet. ${summaryText}`);
    showEvent("RUNDE BEENDET");

    const scoredPlayers = updatedPlayers.map((player) => {
      if (player.status === "busted") {
        return { ...player, cards: [], actionCards: [], secondChance: false, status: "active" as const };
      }

      return {
        ...player,
        score: player.score + roundPoints(player),
        cards: [],
        actionCards: [],
        secondChance: false,
        status: "active" as const,
      };
    });

    setPlayers(scoredPlayers);
    setPendingAction(null);
    setRoundNumber((value) => value + 1);

    const playersAtTarget = scoredPlayers.filter((player) => player.score >= TARGET_SCORE);
    if (playersAtTarget.length > 0) {
      const sortedPlayers = [...scoredPlayers].sort((a, b) => b.score - a.score);
      const finalWinner = sortedPlayers[0];
      const finalLoser = sortedPlayers[1];

      setFinalResult({
        winner: finalWinner.name,
        loser: finalLoser.name,
        winnerScore: finalWinner.score,
        loserScore: finalLoser.score,
      });

      setGameOver(true);
      addLog(`${finalWinner.name} gewinnt mit ${finalWinner.score} Punkten.`);
      showEvent(`${finalWinner.name.toUpperCase()} GEWINNT!`);
      setMessage(`${finalWinner.name} gewinnt das Spiel mit ${finalWinner.score} Punkten!`);
      return;
    }

    const nextStarter = startingPlayer === 0 ? 1 : 0;
    setStartingPlayer(nextStarter);
    setActive(nextStarter);
    setMessage(`${reason} Neue Runde startet. ${scoredPlayers[nextStarter].name} beginnt.`);
  }

  function checkRoundEnd(updatedPlayers: Player[], currentIndex = active) {
    const stillActive = activePlayerIndexes(updatedPlayers);

    if (stillActive.length === 0) {
      const currentPlayerBusted = updatedPlayers[currentIndex]?.status === "busted";

      if (currentPlayerBusted) {
        showEvent("BUST!");
        setTimeout(() => {
          finishRound(updatedPlayers, "Runde beendet.");
        }, 900);
      } else {
        finishRound(updatedPlayers, "Runde beendet.");
      }

      return true;
    }

    setActive(nextActiveIndex(updatedPlayers, currentIndex));
    return false;
  }

  function addCardToPlayer(player: Player, card: GameCard) {
    const updatedPlayer: Player = { ...player, cards: [...player.cards], actionCards: [...player.actionCards] };

    if (card.type === "number") {
      const duplicate = updatedPlayer.cards.some((existing) => existing.type === "number" && existing.number === card.number);

      if (duplicate) {
        if (updatedPlayer.secondChance) {
          updatedPlayer.secondChance = false;
          updatedPlayer.actionCards = updatedPlayer.actionCards.filter((action) => action.type !== "second");
          return {
            player: updatedPlayer,
            busted: false,
            message: `${updatedPlayer.name} zieht erneut die ${card.number}, aber die Second Chance rettet den Spieler. Die doppelte Karte wird abgeworfen.`,
          };
        }

        updatedPlayer.status = "busted";
        updatedPlayer.cards = [];
        updatedPlayer.actionCards = [];
        updatedPlayer.secondChance = false;
        return { player: updatedPlayer, busted: true, message: `${updatedPlayer.name} bustet mit einer weiteren ${card.number}.` };
      }

      updatedPlayer.cards.push(card);

      if (uniqueNumberCount(updatedPlayer) >= 7) {
        updatedPlayer.score += roundPoints(updatedPlayer) + FLIP_7_BONUS;
        updatedPlayer.cards = [];
        updatedPlayer.actionCards = [];
        updatedPlayer.secondChance = false;
        updatedPlayer.status = "active";
        return {
          player: updatedPlayer,
          flip7: true,
          message: `${updatedPlayer.name} erreicht FLIP 7 und erhält ${FLIP_7_BONUS} Bonuspunkte!`,
        };
      }

      return { player: updatedPlayer, busted: false, message: `${updatedPlayer.name} zieht ${card.label}.` };
    }

    if (card.type === "bonus") {
      updatedPlayer.cards.push(card);
      return { player: updatedPlayer, busted: false, message: `${updatedPlayer.name} zieht ${card.label}.` };
    }

    updatedPlayer.actionCards.push(card);
    return { player: updatedPlayer, action: card, busted: false, message: `${updatedPlayer.name} zieht ${card.text}. Wähle, wer die Karte erhält.` };
  }

  function drawCardFor(index: number, forced = false) {
    if (gameOver || winner || pendingAction) return;
    setRoundSummary(null);

    const { card, newDeck } = takeCardFromDeck();
    setDeck(newDeck);

    if (card.type === "second") {
      const secondResult = applySecondChanceRule(players, index);
      setPlayers(secondResult.players);
      setMessage(secondResult.message);
      addLog(secondResult.message);
      showEvent("SECOND CHANCE!");
      setActive(nextActiveIndex(secondResult.players, index));
      return;
    }

    const updated = [...players];
    const result = addCardToPlayer(updated[index], card);
    updated[index] = result.player;
    setPlayers(updated);
    addLog(result.message);

    if (result.flip7) {
      setEventBanner("✨ FLIP 7 ✨");

      setTimeout(() => {
        setEventBanner(null);
        finishRound(updated, result.message);
      }, 2400);

      return;
    }

    if (result.action && !forced) {
      setPendingAction({ card: result.action, fromIndex: index });
      setMessage(result.message);

      if (result.action.type === "flipThree") showEvent("FLIP 3!");
      if (result.action.type === "freeze") showEvent("FREEZE!");

      return;
    }

    setMessage(result.message);

    if (result.message.includes("bustet")) showEvent("BUST!");
    if (result.message.includes("rettet")) showEvent("GERETTET!");

    if (result.busted) {
      checkRoundEnd(updated, index);
      return;
    }

    if (!forced) setActive(nextActiveIndex(updated, index));
  }

  async function chooseActionTarget(targetIndex: number) {
    if (!pendingAction) return;

    const action = pendingAction.card;
    const updated = [...players];
    const target: Player = { ...updated[targetIndex], cards: [...updated[targetIndex].cards], actionCards: [...updated[targetIndex].actionCards] };

    if (action.type === "freeze") {
      target.status = "frozen";
      updated[targetIndex] = target;
      setPlayers(updated);
      setPendingAction(null);
      setMessage(`${target.name} wird durch FREEZE gestoppt und sichert die aktuellen Rundenpunkte.`);
      addLog(`${target.name} wird durch FREEZE gestoppt.`);
      showEvent("FREEZE!");
      checkRoundEnd(updated, pendingAction.fromIndex);
      return;
    }

    if (action.type === "flipThree") {
      let workingDeck = [...deck];
      let log = [`${target.name} erhält FLIP 3.`];
      let tempTarget = target;
      const delayedActions: GameCard[] = [];

      addLog(`${target.name} erhält FLIP 3.`);

      for (let i = 0; i < 3; i++) {
        if (tempTarget.status === "busted") break;

        const draw = takeCardFromDeck(workingDeck);
        workingDeck = draw.newDeck;
        setDeck(workingDeck);

        if (draw.card.type === "second") {
          updated[targetIndex] = tempTarget;
          const secondResult = applySecondChanceRule(updated, targetIndex);
          updated[0] = secondResult.players[0];
          updated[1] = secondResult.players[1];
          tempTarget = updated[targetIndex];
          log.push(secondResult.message);
          setPlayers([...updated]);
          setMessage(log.join(" "));
          addLog(secondResult.message);
          showEvent("SECOND CHANCE!");
          await delay(750);
          continue;
        }

        const result = addCardToPlayer(tempTarget, draw.card);
        tempTarget = result.player;
        updated[targetIndex] = tempTarget;
        log.push(result.message);
        setPlayers([...updated]);
        setMessage(log.join(" "));
        addLog(result.message);

        if (result.action) delayedActions.push(result.action);
        if (result.message.includes("rettet")) showEvent("GERETTET!");
        if (result.message.includes("bustet")) showEvent("BUST!");
        if (result.flip7) {
          setEventBanner("✨ FLIP 7 ✨");
        }

        await delay(750);

        if (result.flip7) break;
      }

      setDeck(workingDeck);
      updated[targetIndex] = tempTarget;
      setPlayers(updated);
      setPendingAction(null);

      if (tempTarget.status === "busted") {
        setMessage(log.join(" "));
        showEvent("BUST!");
        checkRoundEnd(updated, pendingAction.fromIndex);
        return;
      }

      if (tempTarget.score >= TARGET_SCORE) {
        finishRound(updated, `${tempTarget.name} hat ${tempTarget.score} Punkte erreicht.`);
        return;
      }

      const playableAction = delayedActions.find((card) => card.type === "freeze" || card.type === "flipThree");
      if (playableAction) {
        setPendingAction({ card: playableAction, fromIndex: targetIndex });
        setMessage(`${log.join(" ")} Wähle jetzt, wer ${playableAction.text} erhält.`);

        if (playableAction.type === "flipThree") showEvent("FLIP 3!");
        if (playableAction.type === "freeze") showEvent("FREEZE!");

        return;
      }

      setMessage(log.join(" "));
      checkRoundEnd(updated, pendingAction.fromIndex);
    }
  }

  function stay() {
    if (gameOver || winner || pendingAction || current.status !== "active") return;

    const updated = [...players];
    updated[active] = { ...updated[active], status: "stayed" };
    setPlayers(updated);
    setMessage(`${current.name} sichert und erhält am Ende der Runde ${roundPoints(current)} Punkte.`);
    addLog(`${current.name} sichert ${roundPoints(current)} Punkte.`);
    checkRoundEnd(updated, active);
  }

  function delay(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function resetGame() {
    setPlayers(createPlayers());
    setDeck(buildDeck());
    setActive(0);
    setStartingPlayer(0);
    setPendingAction(null);
    setGameOver(false);
    setRoundNumber(1);
    setRoundSummary(null);
    setFinalResult(null);
    setGameLog([]);
    setEventBanner(null);
    setMessage("Neues Spiel. Dion beginnt. Ziehe eine Karte oder sichere deine Punkte.");
  }

  return (
    <main className="app-shell">
      {eventBanner && (
        <motion.div
          className="event-banner"
          initial={{ scale: 0.5, opacity: 0, y: -20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.7, opacity: 0 }}
        >
          {eventBanner}
        </motion.div>
      )}

      <div className="app-container">
        <div className="title-block">
          <motion.h1 initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
            FLIP 7
          </motion.h1>
          <p>Privater Spiel-Prototyp für Dion & Franzi</p>
        </div>
        <div className="online-panel">
  <div>
    <strong>Online-Spiel</strong>
    <p>{connectedRoom ? `Verbunden mit Raum: ${connectedRoom}` : "Noch nicht verbunden"}</p>
  </div>

  <div className="online-controls">
    <input
      value={roomCode}
      onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
      placeholder="Raumcode"
    />

    <button onClick={createOnlineGame}>Spiel erstellen</button>
    <button onClick={joinOnlineGame}>Beitreten</button>
    <button
  className={myPlayerIndex === 0 ? "role-button dion-role selected-role" : "role-button dion-role"}
  onClick={() => setMyPlayerIndex(0)}
>
  Ich bin Dion
</button>

<button
  className={myPlayerIndex === 1 ? "role-button franzi-role selected-role" : "role-button franzi-role"}
  onClick={() => setMyPlayerIndex(1)}
>
  Ich bin Franzi
</button>
{connectedRoom && (
  <button onClick={() => navigator.clipboard.writeText(connectedRoom)}>
    Raumcode kopieren
  </button>
)}

<div className="turn-indicator">
  {myPlayerIndex === null
    ? "Bitte wähle zuerst deinen Spieler."
    : myPlayerIndex === active
    ? "Du bist am Zug."
    : `Warte auf ${players[active].name}.`}
</div>
<div className="role-indicator">
  Du spielst als:{" "}
  <strong>
    {myPlayerIndex === 0
      ? "Dion"
      : myPlayerIndex === 1
      ? "Franzi"
      : "noch nicht gewählt"}
  </strong>
</div>
  </div>
</div>
        {finalResult && (
          <div className="final-result-banner">
            <div className="winner-cup">🏆</div>
            <div>
              <h2>{finalResult.winner} gewinnt!</h2>
              <p>
                Endstand: {finalResult.winner} {finalResult.winnerScore} : {finalResult.loserScore} {finalResult.loser}
              </p>
              <p className="loser-line">Verlierer: {finalResult.loser}</p>
            </div>
          </div>
        )}

        <div className="players-grid">
          {players.map((player, index) => (
            <PlayerPanel key={player.name} player={player} active={active === index && !pendingAction} winner={winner?.name === player.name} />
          ))}
        </div>

        <div className="panel main-panel">
          <div className="control-row">
            <div>
              <p className="eyebrow">Runde {roundNumber}</p>
              <h2>{pendingAction ? pendingAction.card.text : `${current.name} ist am Zug`}</h2>
              <p className="message">{message}</p>
            </div>

            {!pendingAction ? (
              <div className="buttons-row">
                <GameButton
  onClick={() => drawCardFor(active)}
  disabled={
    gameOver ||
    !!winner ||
    current.status !== "active" ||
    (isOnlineGame && myPlayerIndex !== active)
  }
>
                  Karte ziehen
                </GameButton>
                <GameButton
  onClick={stay}
  disabled={
    gameOver ||
    !!winner ||
    current.status !== "active" ||
    current.cards.length === 0 ||
    (isOnlineGame && myPlayerIndex !== active)
  }
  variant="secondary"
>
                  Punkte sichern
                </GameButton>
                <GameButton onClick={resetGame} variant="outline">
                  <RotateCcw size={20} />
                </GameButton>
              </div>
            ) : (
              <div className="buttons-row">
                {activeIndexes.map((index) => (
                  <GameButton
                  key={players[index].name}
                  onClick={() => chooseActionTarget(index)}
                  disabled={
                    isOnlineGame &&
                    myPlayerIndex !== pendingAction?.fromIndex
                  }
                >
                    Gib an {players[index].name}
                  </GameButton>
                ))}
                <GameButton onClick={resetGame} variant="outline">
                  <RotateCcw size={20} />
                </GameButton>
              </div>
            )}
          </div>


          {roundSummary && (
            <div className="round-summary">
              <strong>Runden-Zusammenfassung</strong>
              <span>{roundSummary}</span>
            </div>
          )}

          <div className="table-area split-table">
            {players.map((player, index) => (
              <div
                key={player.name}
                className={`player-card-zone ${player.name === "Dion" ? "dion-zone" : "franzi-zone"} ${active === index && !pendingAction ? "active-zone" : ""}`}
              >
                <div className="zone-header">
                  <strong>{player.name === "Dion" ? "Dions Karten" : "Franzis Karten"}</strong>
                  <span>Rundenpunkte: {roundPoints(player)}</span>
                </div>

                <div className="cards-row">
                  <AnimatePresence>
                    {player.cards.map((card, cardIndex) => (
                      <CardTile key={`${player.name}-${card.label}-${cardIndex}-${roundNumber}`} card={card} />
                    ))}
                  </AnimatePresence>

                  {player.cards.length === 0 && <p className="empty-text">Noch keine Karten.</p>}
                </div>
              </div>
            ))}

            <div className="deck-box">
              <div className="deck-stack">
                <div className="deck-card deck-card-back back-3">
                  FLIP<br />
                  <span>7</span>
                </div>
                <div className="deck-card deck-card-back back-2">
                  FLIP<br />
                  <span>7</span>
                </div>
                <div className="deck-card deck-card-back back-1">
                  FLIP<br />
                  <span>7</span>
                </div>
              </div>

              <div className="deck-count">Deck: {deck.length}</div>
            </div>
          </div>

          <div className="game-log-panel">
            <div className="game-log-title">Spiel-Log</div>

            <div className="game-log-list">
              {gameLog.length === 0 && <div className="log-empty">Noch keine Aktionen.</div>}

              {gameLog.map((entry, index) => (
                <div
                  key={`${entry}-${index}`}
                  className={`log-entry
                    ${entry.includes("BUST") || entry.includes("bustet") ? "log-bust" : ""}
                    ${entry.includes("FLIP 7") ? "log-flip7" : ""}
                    ${entry.includes("FREEZE") || entry.includes("eingefroren") ? "log-freeze" : ""}
                    ${entry.includes("Second Chance") ? "log-second" : ""}
                  `}
                >
                  {entry}
                </div>
              ))}
            </div>
          </div>

          <div className="rules-grid">
            <div>Ziel: Als Erstes {TARGET_SCORE} Punkte erreichen.</div>
            <div>Doppelte Zahl: Bust, außer die Second Chance rettet dich.</div>
            <div>Sieben verschiedene Zahlen: sofort FLIP 7 + {FLIP_7_BONUS} Bonuspunkte.</div>
            <div>Aktionskarten können aktiven Spielern zugewiesen werden.</div>
          </div>
        </div>
      </div>
    </main>
  );
}
