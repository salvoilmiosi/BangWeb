import { createContext, useContext, useRef, useState } from 'react';
import { ConnectionContext } from '../../App';
import { useHandlers } from '../../Messages/Connection';
import { deserializeImage } from '../../Utils/ImageSerial';
import { ChatMessage, LobbyAddUser, LobbyEntered, LobbyId, LobbyOwner, LobbyRemoveUser, UserId } from '../../Messages/ServerMessage';
import GameScene from '../Game/GameScene';
import GameOptionsEditor from './GameOptionsEditor';
import LobbyChat from './LobbyChat';
import LobbyUser, { UserValue } from './LobbyUser';
import { GameOptions, GameUpdate } from '../Game/Model/GameUpdate';

export interface LobbyProps {
  myLobbyId: LobbyId;
  myUserId?: UserId;
  lobbyName: string;
  gameOptions: GameOptions;
  editLobby: (lobbyName: string, gameOptions: GameOptions) => void;
}

export interface LobbyState {
  lobbyName: string;
  users: UserValue[];
  myUserId?: UserId;
  lobbyOwner?: UserId;
}

export const LobbyContext = createContext<LobbyState>({ lobbyName: 'Bang!', users: [] });

export default function LobbyScene({ myLobbyId, myUserId, lobbyName, gameOptions, editLobby }: LobbyProps) {
  const connection = useContext(ConnectionContext);

  const [isGameStarted, setIsGameStarted] = useState(false);
  const gameUpdates = useRef<GameUpdate[]>([]);

  const [users, setUsers] = useState<UserValue[]>([]);
  const [lobbyOwner, setLobbyOwner] = useState<UserId>();

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  useHandlers(connection, [],
    ['lobby_add_user', ({ user_id, user: { name, profile_image } }: LobbyAddUser) => {
      setUsers(users => {
        let copy = [...users];
        const newUser = { id: user_id, name, propic: deserializeImage(profile_image) };
        let index = copy.findIndex(user => user.id === user_id);
        if (index >= 0) {
          copy[index] = newUser;
        } else {
          copy.push(newUser);
        }
        return copy;
      });
    }],
    ['lobby_remove_user', ({ user_id }: LobbyRemoveUser) => {
      setUsers(users =>
        users.filter(user => user.id !== user_id)
      );
    }],
    ['lobby_owner', ({ user_id }: LobbyOwner) => {
      setLobbyOwner(user_id);
    }],
    ['lobby_chat', (message: ChatMessage) => {
      setChatMessages(messages => messages.concat(message));
    }],
    ['lobby_entered', ({ lobby_id }: LobbyEntered) => {
      if (lobby_id == myLobbyId) {
        gameUpdates.current = [];
        setIsGameStarted(false);
        setUsers([]);
      }
    }],
    ['game_started', () => {
      setIsGameStarted(true);
    }],
    ['game_update', (update: any) => {
      const updateType = Object.keys(update)[0];
      const updateValue = update[updateType];
      gameUpdates.current.push({ updateType, updateValue });
    }]
  );

  const getGameScene = () => {
    return (
      <GameScene channel={{
        getNextUpdate: () => gameUpdates.current.shift(),
        sendGameAction: () => (messageType: string, messageValue: any = {}) => {
          connection?.sendMessage('game_action', { [messageType]: messageValue });
        },
        handleReturnLobby: () => connection?.sendMessage('lobby_return')
      }} />
    );
  };

  const getLobbyScene = () => {
    const handleStartGame = () => connection?.sendMessage('game_start');

    const handleEditGameOptions = (gameOptions: GameOptions) => {
      localStorage.setItem('lobbyName', lobbyName);
      localStorage.setItem('gameOptions', JSON.stringify(gameOptions));
      connection?.sendMessage('lobby_edit', { name: lobbyName, options: gameOptions });
      editLobby(lobbyName, gameOptions);
    };

    return <div>
      {myUserId == lobbyOwner ?
        <button className="
        bg-blue-500
        hover:bg-blue-600
        text-white
        py-2
        px-4
        rounded-md
        focus:outline-none
        focus:ring-2
        focus:ring-blue-500
        " onClick={handleStartGame}>Start Game</button>
        : null}
      <GameOptionsEditor gameOptions={gameOptions} setGameOptions={handleEditGameOptions} readOnly={myUserId != lobbyOwner} />
      {users.map(user => (
        <LobbyUser key={user.id} user={user} isOwner={user.id === lobbyOwner} />
      ))}
    </div>
  }

  const handleSendMessage = (message: string) => {
    connection?.sendMessage('lobby_chat', { message: message });
  }

  return (
    <LobbyContext.Provider value={{ lobbyName, users, myUserId, lobbyOwner }}>
      {isGameStarted ? getGameScene() : getLobbyScene()}
      <LobbyChat messages={chatMessages} handleSendMessage={handleSendMessage} />
    </LobbyContext.Provider>
  );
}