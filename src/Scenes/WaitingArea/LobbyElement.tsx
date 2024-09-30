import Button from "../../Components/Button";
import getLabel from "../../Locale/GetLabel";
import { LobbyId } from "../../Model/ServerMessage";

export interface LobbyValue {
  id: LobbyId;
  name: string;
  num_players: number;
  num_spectators: number;
  max_players: number;
  secure: boolean;
  state: string;
}

export interface LobbyElementProps {
  lobby: LobbyValue;
  onClickJoin: (lobby_id: LobbyId, secure: boolean) => void;
}

function LobbyElement({ lobby: { id, name, num_players, num_spectators, max_players, secure, state }, onClickJoin }: LobbyElementProps) {
  const numPlayersStatus = `${num_players}/${max_players}` + (num_spectators > 0 ? `+${num_spectators}` : '');
  return (
    <div className="lobby-element">
      <div id='lobby-name'>{name}</div>
      <div id='num-players'>{numPlayersStatus}</div>
      <div id='lobby-state'>{getLabel('LobbyState', state)}</div>
      <div id='lobby-button-join'><Button color='green' onClick={() => onClickJoin(id, secure)}>
        {getLabel('ui', 'BUTTON_JOIN')}{secure && <div className='lobby-secure-icon' />}
      </Button></div>
    </div>
  )
}

export default LobbyElement