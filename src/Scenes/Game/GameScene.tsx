import { useReducer, useRef } from "react";
import { GameStringComponent } from "../../Locale/Locale";
import { PocketType } from "../../Messages/CardEnums";
import { PlayerId } from "../../Messages/GameUpdate";
import { UserId } from "../../Messages/ServerMessage";
import { setMapRef, useMapRef } from "../../Utils/MapRef";
import { getDivRect } from "../../Utils/Rect";
import { useInterval } from "../../Utils/UseInterval";
import { UserValue } from "../Lobby/LobbyUser";
import AnimationView from "./AnimationView";
import CardButtonView from "./CardButtonView";
import CountPocket from "./CountPocket";
import GameLogView from "./GameLogView";
import { PocketRef, getCard, getPlayer, newGameTable } from "./Model/GameTable";
import { gameTableDispatch } from "./Model/GameTableDispatch";
import { GameChannel, GameUpdateHandler } from "./Model/GameUpdateHandler";
import PlayerView, { PlayerRef } from "./PlayerView";
import PocketView, { CardTracker, PocketPosition } from "./PocketView";
import "./Style/GameScene.css";

const FRAMERATE = 60;

export interface TableProps {
  channel: GameChannel;
  users: UserValue[];
  myUserId: UserId;
  lobbyOwner?: UserId;
}

export default function GameScene({ channel, users, myUserId, lobbyOwner }: TableProps) {
  const [table, tableDispatch] = useReducer(gameTableDispatch, myUserId, newGameTable);
  const game = useRef<GameUpdateHandler>();
  if (!game.current) {
    game.current = new GameUpdateHandler(channel, tableDispatch);
  }

  useInterval((timeElapsed: number) => game.current?.tick(timeElapsed), 1000 / FRAMERATE, []);

  const pocketRefs = useMapRef<PocketType, PocketPosition>();
  const playerRefs = useMapRef<PlayerId, PlayerRef>();
  const cubesRef = useRef<HTMLDivElement>(null);

  const tracker: CardTracker = {
    getPocketPosition: (pocket: PocketRef) => {
      if (!pocket) {
        return undefined;
      } else if (pocket.name == 'scenario_deck' || pocket.name == 'wws_scenario_deck') {
        const holder = pocket.name == 'scenario_deck' ? table.status.scenario_deck_holder : table.status.wws_scenario_deck_holder;
        return holder ? playerRefs.current?.get(holder)?.positions.get(pocket.name) : undefined;
      } else if ('player' in pocket) {
        return playerRefs.current?.get(pocket.player)?.positions.get(pocket.name);
      } else {
        return pocketRefs.current?.get(pocket.name);
      }
    },
    getCubesPosition: () => {
      return cubesRef.current ? getDivRect(cubesRef.current) : undefined;
    }
  };

  return (
    <div className="game-scene-top">
      <div className="game-scene">
        <div className="m-auto align-middle">
          {table.pockets.shop_deck.length != 0 || table.pockets.shop_discard.length != 0 ? <>
            <div className="stack-pockets">
              <div className="stack-pockets-inner single-card-pocket">
                <PocketView ref={setMapRef(pocketRefs, 'shop_discard')} table={table} cards={table.pockets.shop_discard.slice(0, 1)} />
              </div>
              <CountPocket ref={setMapRef(pocketRefs, 'shop_deck')} table={table} cards={table.pockets.shop_deck} />
            </div>
            <PocketView ref={setMapRef(pocketRefs, 'shop_selection')} table={table} cards={table.pockets.shop_selection.slice(0).reverse()} />
          </> : null}
          <div className='table-cubes' ref={cubesRef}>
            {table.status.num_cubes > 0 ?
              <><img src='/media/sprite_cube.png' />x{table.status.num_cubes}</> : null}
          </div>
          <div className="single-card-pocket">
            <PocketView ref={setMapRef(pocketRefs, 'discard_pile')} table={table} cards={table.pockets.discard_pile.slice(-2)} />
          </div>
          <CountPocket ref={setMapRef(pocketRefs, 'main_deck')} table={table} cards={table.pockets.main_deck} />
          <PocketView ref={setMapRef(pocketRefs, 'selection')} table={table} cards={table.pockets.selection} />
        </div>
        <div className="m-auto status-text">
          {'status_text' in table.status.request
            ? <GameStringComponent table={table} users={users} message={table.status.request.status_text} />
            : null}
          {myUserId == lobbyOwner && table.status.flags.includes('game_over') ?
            <button onClick={channel.handleReturnLobby}>Return to Lobby</button>
          : null}
        </div>
        <div className="m-auto">
          {table.alive_players.map(player_id => {
            const player = getPlayer(table, player_id);
            const user = users.find(user => user.id === player.userid);

            return <PlayerView ref={setMapRef(playerRefs, player_id)} key={player_id} table={table} user={user} player={player} />;
          })}
        </div>
        <div className="m-auto">
          {table.pockets.button_row.map(id => <CardButtonView key={id} card={getCard(table, id)} />)}
        </div>
        <AnimationView table={table} tracker={tracker} />
      </div>
      <GameLogView table={table} users={users} />
    </div>
  );
}