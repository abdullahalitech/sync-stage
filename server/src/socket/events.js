/**
 * Single source of truth for the Socket.io event names shared between the
 * server and the client. Keeping them here avoids typos and makes the realtime
 * "contract" easy to reason about.
 */
export const EVENTS = {
  // Connection lifecycle
  CONNECT: 'connection',
  DISCONNECT: 'disconnect',

  // Room management (client -> server)
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',

  // Room state (server -> client)
  ROOM_KICK: 'room:kick',
  ROOM_BAN: 'room:ban',

  ROOM_STATE: 'room:state',
  ROOM_USERS: 'room:users',
  ROOM_HOST_CHANGED: 'room:host-changed',
  ROOM_ERROR: 'room:error',
  ROOM_KICKED: 'room:kicked',
  ROOM_BANNED: 'room:banned',
  USER_JOINED: 'room:user-joined',
  USER_LEFT: 'room:user-left',

  // Chat
  CHAT_SEND: 'chat:send',
  CHAT_MESSAGE: 'chat:message',

  // Reactions
  REACTION_SEND: 'reaction:send',
  REACTION_RECEIVE: 'reaction:receive',

  // Player sync (host controls, everyone follows)
  PLAYER_PLAY: 'player:play',
  PLAYER_PAUSE: 'player:pause',
  PLAYER_SEEK: 'player:seek',
  PLAYER_STATE: 'player:state',

  // Queue / playlist
  QUEUE_ADD: 'queue:add',
  QUEUE_REMOVE: 'queue:remove',
  QUEUE_PLAY_NOW: 'queue:play-now',
  QUEUE_ENDED: 'queue:ended',
  QUEUE_UPDATED: 'queue:updated',
  QUEUE_VOTE: 'vote_queue_item',

  SKIP_VOTE: 'skip:vote',
  SKIP_UPDATED: 'skip:updated',

  // Clock sync (RTT / serverTimeOffset)
  TIME_SYNC: 'time:sync',

  // Time-stamped reactions + heatmap
  REACTION_TS_SEND: 'send_timestamped_reaction',
  REACTION_TS_NEW: 'new_timestamped_reaction',

  // Room modes + host control (DJ | PARTY)
  ROOM_MODE_SET: 'set_room_mode',
  ROOM_MODE_UPDATED: 'room:mode-updated',
  HOST_CLAIM: 'claim_host',
  HOST_TRANSFER: 'transfer_host',

  // WebRTC voice stage signaling
  VOICE_JOIN: 'voice:join',
  VOICE_LEAVE: 'voice:leave',
  VOICE_PEERS: 'voice:peers',
  VOICE_PEER_JOINED: 'voice:peer-joined',
  VOICE_PEER_LEFT: 'voice:peer-left',
  VOICE_SPEAKING: 'voice:speaking',

  // WebRTC screen share signaling
  SCREEN_SHARE_START: 'screen:share-start',
  SCREEN_SHARE_STOP: 'screen:share-stop',
  SCREEN_SHARE_UPDATED: 'screen:updated',
};
