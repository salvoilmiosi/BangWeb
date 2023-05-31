import { GameFlag } from "../../Messages/CardEnums";
import { AddCardsUpdate, AddCubesUpdate, CardId, DeckShuffledUpdate, HideCardUpdate, MoveCardUpdate, MoveCubesUpdate, MoveScenarioDeckUpdate, MoveTrainUpdate, PlayerAddUpdate, PlayerGoldUpdate, PlayerHpUpdate, PlayerId, PlayerOrderUpdate, PlayerShowRoleUpdate, PlayerStatusUpdate, RemoveCardsUpdate, RequestStatusArgs, ShowCardUpdate, StatusReadyArgs, TapCardUpdate } from "../../Messages/GameUpdate";
import { UserId } from "../../Messages/ServerMessage";
import { GameTable, Id, Player, PocketRef, TablePockets, getCard, newCard, newGameTable, newPlayer, newPocketRef, searchById } from "./GameTable";

export interface GameUpdate {
    updateType: string,
    updateValue?: any
}

export function handleGameUpdate(table: GameTable, update: GameUpdate): GameTable {
    let handler = gameUpdateHandlers.get(update.updateType);
    if (handler) {
        return handler(table, update.updateValue);
    } else {
        return table;
    }
}

const gameUpdateHandlers = new Map<string, (table: GameTable, update: any) => GameTable>([
    ['reset', handleReset],
    ['add_cards', handleAddCards],
    ['remove_cards', handleRemoveCards],
    ['move_card', handleMoveCard],
    ['add_cubes', handleAddCubes],
    ['move_cubes', handleMoveCubes],
    ['move_scenario_deck', handleMoveScenarioDeck],
    ['move_train', handleMoveTrain],
    ['deck_shuffled', handleDeckShuffled],
    ['show_card', handleShowCard],
    ['hide_card', handleHideCard],
    ['tap_card', handleTapCard],
    ['player_add', handlePlayerAdd],
    ['player_order', handlePlayerOrder],
    ['player_hp', handlePlayerHp],
    ['player_gold', handlePlayerGold],
    ['player_show_role', handlePlayerShowRole],
    ['player_status', handlePlayerStatus],
    ['switch_turn', handleSwitchTurn],
    ['request_status', handleRequestStatus],
    ['status_ready', handleRequestStatus],
    ['game_flags', handleGameFlags],
    ['status_clear', handleStatusClear]
]);

/// GameTable.players and GameTable.cards are sorted by id
/// So that finding an object in those arrays is O(log n)
function sortById(lhs: Id, rhs: Id) {
    return lhs.id - rhs.id;
}

/// Takes as arguments an array of values, an id and a mapping function
/// This function finds the element with the specified id and returns a new array of values
/// with the found object modified according to the mapper function
function editById<T extends Id>(values: T[], id: number, mapper: (value: T) => T): T[] {
    return values.map(value => {
        if (value.id === id) {
            return mapper(value);
        } else {
            return value;
        }
    });
}

function editPocketMap(
    pockets: TablePockets, players: Player[], pocket: PocketRef,
    cardMapper: (cards: CardId[]) => CardId[]): [TablePockets, Player[]]
{
    const mapper = <T extends { [key: string]: CardId[] }>(pocketMap: T, pocketName: keyof T): T => {
        return { ...pocketMap, [pocketName]: cardMapper(pocketMap[pocketName]) };
    };
    if (pocket) {
        if ('player' in pocket) {
            players = editById(players, pocket.player, player => ({ ...player, pockets: mapper(player.pockets, pocket.name)}));
        } else {
            pockets = mapper(pockets, pocket.name);
        }
    }
    return [pockets, players];
}

/// Adds a list of cards to a pocket
function addToPocket(pockets: TablePockets, players: Player[], cardsToAdd: CardId[], pocket: PocketRef) {
    return editPocketMap(pockets, players, pocket, cards => cards.concat(cardsToAdd));
}

/// Removes a list of cards from a pocket
function removeFromPocket(pockets: TablePockets, players: Player[], cardsToRemove: CardId[], pocket: PocketRef) {
    return editPocketMap(pockets, players, pocket, cards => cards.filter(id => !cardsToRemove.includes(id)));
}

/// Handles the 'reset' update, recreating the game table
function handleReset(table: GameTable, userId?: UserId): GameTable {
    return newGameTable(userId ?? table.myUserId);
}

/// Handles the 'add_cards' update, creates new cards and adds them in the specified pocket
function handleAddCards(table: GameTable, { card_ids, pocket, player }: AddCardsUpdate): GameTable {
    const pocketRef = newPocketRef(pocket, player);
    const [pockets, players] = addToPocket(table.pockets, table.players, card_ids.map(card => card.id), pocketRef);
    return {
        ...table,
        cards: table.cards.concat(card_ids.map(({ id, deck }) => newCard(id, deck, pocketRef))).sort(sortById),
        pockets, players
    };
}

function group<Key, Value>(values: Value[], mapper: (value: Value) => Key): Map<Key, Value[]> {
    let map = new Map<Key, Value[]>();
    values.forEach(value => {
        const key = mapper(value);
        map.set(key, (map.get(key) ?? []).concat(value));
    });
    return map;
}

/// Handles the 'remove_cards' update, removes the specified cards
function handleRemoveCards(table: GameTable, { cards }: RemoveCardsUpdate): GameTable {
    // Groups cards by pocket
    // NOTE pockets are compared by identity in the map, this could be optimized
    const pocketCards = group(cards, id => getCard(table, id)?.pocket ?? null);

    let [pockets, players] = [table.pockets, table.players];

    // For each pocket remove all the cards in the array
    pocketCards.forEach((cards, pocket) => {
        [pockets, players] = removeFromPocket(pockets, players, cards, pocket);
    });

    // ... and remove the cards themselves
    return {
        ...table,
        cards: table.cards.filter(card => !cards.includes(card.id)),
        pockets, players
    };
}

function tryRotate<T>(values: T[], value?: T): boolean {
    if (value) {
        const index = values.indexOf(value);
        if (index > 0) {
            values.unshift(...values.splice(index, values.length));
            return true;
        }
    }
    return false;
}

// Moves the player which the user is controlling to the first element of the array
function rotatePlayers(players: PlayerId[], selfPlayer?: PlayerId, firstPlayer?: PlayerId) {
    tryRotate(players, selfPlayer) || tryRotate(players, firstPlayer);
    return players;
};

// Handles the 'player_add' update, creates new players with specified player_id and user_id
function handlePlayerAdd(table: GameTable, { players }: PlayerAddUpdate): GameTable {
    const newPlayers = table.players.concat(players.map(({player_id, user_id}) => newPlayer(player_id, user_id))).sort(sortById);
    const selfPlayer = newPlayers.find(p => p.userid === table.myUserId)?.id;
    return {
        ...table,
        players: newPlayers,
        alive_players: rotatePlayers(table.alive_players.concat(players.map(player => player.player_id)), selfPlayer),
        self_player: selfPlayer
    };
}

// Handles the 'player_order' update, changing the order of how players are seated
function handlePlayerOrder(table: GameTable, { players }: PlayerOrderUpdate): GameTable {
    return { ...table, alive_players: rotatePlayers(players, table.self_player, table.alive_players.at(0)) };
}

// Handles the 'player_hp' update, changes a player's hp
function handlePlayerHp(table: GameTable, { player, hp }: PlayerHpUpdate): GameTable {
    return {
        ...table,
        players: editById(table.players, player, p => ({ ...p, status: { ...p.status, hp }}))
    };
}

// Handles the 'player_hp' update, changes a player's gold
function handlePlayerGold(table: GameTable, { player, gold }: PlayerGoldUpdate): GameTable {
    return {
        ...table,
        players: editById(table.players, player, p => ({ ...p, status: { ...p.status, gold }}))
    };
}

// Handles the 'player_hp' update, changes a player's role
function handlePlayerShowRole(table: GameTable, { player, role }: PlayerShowRoleUpdate): GameTable {
    return {
        ...table,
        players: editById(table.players, player, p => ({ ...p, status: { ...p.status, role }}))
    };
}

// Handles the 'player_hp' update, changes a player's status
function handlePlayerStatus(table: GameTable, { player, flags, range_mod, weapon_range, distance_mod }: PlayerStatusUpdate): GameTable {
    let newAlivePlayers = table.alive_players;
    let newDeadPlayers = table.dead_players;
    if (flags.includes('removed') && newAlivePlayers.includes(player)) {
        newAlivePlayers = newAlivePlayers.filter(id => id !== player);
        newDeadPlayers = newDeadPlayers.concat(player);
    }

    return {
        ...table,
        players: editById(table.players, player, p => ({ ...p, status: {
            ...p.status,
            flags, range_mod, weapon_range, distance_mod
        }})),
        alive_players: newAlivePlayers,
        dead_players: newDeadPlayers
    };
}

/// Handles the 'switch_turn' update, changes the current_turn field
function handleSwitchTurn(table: GameTable, player: PlayerId): GameTable {
    return {
        ...table,
        status: {
            ...table.status,
            current_turn: player
        }
    };
}

// Handles the 'move_card' update, removing a card from its pocket and moving it to another
function handleMoveCard(table: GameTable, { card, player, pocket }: MoveCardUpdate): GameTable {
    const cardObj = getCard(table, card);
    if (!cardObj) {
        throw new Error("Card not found in MoveCardUpdate");
    }

    const pocketRef = newPocketRef(pocket, player);
    
    let [pockets, players] = removeFromPocket(table.pockets, table.players, [card], cardObj.pocket);
    [pockets, players] = addToPocket(pockets, players, [card], pocketRef);

    return {
        ...table,
        cards: editById(table.cards, card, card => ({ ...card, pocket: pocketRef })),
        players: players,
        pockets: pockets
    };
}

// Handles the 'deck_shuffled' update
// This moves all cards from discard_pile to main_deck or from shop_discard to shop_deck
function handleDeckShuffled(table: GameTable, { pocket }: DeckShuffledUpdate): GameTable {
    const fromPocket = pocket === 'main_deck' ? 'discard_pile' : 'shop_discard';
    return {
        ...table,
        cards: table.cards.map(card => {
            if (card.pocket?.name === pocket) {
                return { ...card, cardData: { deck: card.cardData.deck }, pocket: { name: pocket } };
            } else {
                return card;
            }
        }),
        pockets: {
            ...table.pockets,
            [fromPocket]: [],
            [pocket]: table.pockets[fromPocket]
        }
    };
}

// Handles the 'show_card' update, sets the cardData field
function handleShowCard(table: GameTable, { card, info }: ShowCardUpdate): GameTable {
    return {
        ...table,
        cards: editById(table.cards, card, card => ({ ...card, cardData: info }))
    };
}

// Handles the 'hide_card' update, clears the cardData field
function handleHideCard(table: GameTable, { card }: HideCardUpdate): GameTable {
    return {
        ...table,
        cards: editById(table.cards, card, card => ({ ...card, cardData: { deck: card.cardData.deck } }))
    };
}

// Handles the 'tap_card' update, sets the inactive field
function handleTapCard(table: GameTable, { card, inactive }: TapCardUpdate): GameTable {
    return {
        ...table,
        cards: editById(table.cards, card, card => ({ ...card, inactive }))
    };
}

// Handles the 'add_cubes' update, adding cubes to a target_card (or the table if not set)
function handleAddCubes(table: GameTable, { num_cubes, target_card }: AddCubesUpdate): GameTable {
    let tableCards = table.cards;
    let tableCubes = table.status.num_cubes;
    if (target_card) {
        tableCards = editById(table.cards, target_card, card => ({ ...card, num_cubes: card.num_cubes + num_cubes }));
    } else {
        tableCubes += num_cubes;
    }
    return {
        ...table,
        status: { ...table.status, num_cubes: tableCubes },
        cards: tableCards
    };
}

// Handles the 'move_cubes' update, moving `num_cubes` from origin_card (or the table if not set) to target_card (or the table if not set)
function handleMoveCubes(table: GameTable, { num_cubes, origin_card, target_card }: MoveCubesUpdate): GameTable {
    let tableCubes = table.status.num_cubes;
    let tableCards = table.cards;
    
    if (origin_card) {
        tableCards = editById(tableCards, origin_card, card => ({ ...card, num_cubes: card.num_cubes - num_cubes }));
    } else {
        tableCubes -= num_cubes;
    }
    if (target_card) {
        tableCards = editById(tableCards, target_card, card => ({ ...card, num_cubes: card.num_cubes + num_cubes }));
    } else {
        tableCubes += num_cubes;
    }
    return {
        ...table,
        status: {
            ...table.status,
            num_cubes: tableCubes
        },
        cards: tableCards
    };
}

// Handles the 'move_scenario_deck' update, changes the scenario_deck_holder or wws_scenario_deck_holder field
function handleMoveScenarioDeck(table: GameTable, { player, pocket }: MoveScenarioDeckUpdate): GameTable {
    return {
        ...table,
        status: {
            ...table.status,
            [pocket + '_holder']: player
        }
    }
}

// Handles the 'move_train' update, changes the train_position field
function handleMoveTrain(table: GameTable, { position }: MoveTrainUpdate): GameTable {
    return {
        ...table,
        status: {
            ...table.status,
            train_position: position
        }
    };
}

// Handles the 'game_flags' update, changes the status.flags field
function handleGameFlags(table: GameTable, flags: GameFlag[]): GameTable {
    return {
        ...table,
        status: {
            ...table.status,
            flags
        }
    };
}

// Handles the 'request_status' and the 'status_ready' updates, changes the status.request field
function handleRequestStatus(table: GameTable, status: RequestStatusArgs | StatusReadyArgs): GameTable {
    return {
        ...table,
        status: {
            ...table.status,
            request: status
        }
    };
}

// Handles the 'status_clear' update, clearing the status.request field
function handleStatusClear(table: GameTable): GameTable {
    return {
        ...table,
        status: {
            ...table.status,
            request: undefined
        }
    };
}