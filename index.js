const { Client, GatewayIntentBits, ChannelType } = require('discord.js')
const {
  joinVoiceChannel,
  createAudioPlayer,
  NoSubscriberBehavior,
  createAudioResource,
  getVoiceConnection,
  AudioPlayerStatus
} = require('@discordjs/voice')
const countdown = require('countdown')
const Database = require('./database')
const { botId, token } = require('./config.json')

const FILE_PATH = './cuban-pete.mp3'

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
})
const db = new Database()
// eslint-disable-next-line no-bitwise
const COUNTDOWN_UNITS = countdown.HOURS | countdown.MINUTES | countdown.SECONDS

const audioPlayer = createAudioPlayer({
  behaviors: {
    noSubscriber: NoSubscriberBehavior.Stop
  }
})

client.login(token)
  // eslint-disable-next-line no-console
  .then(() => console.log('Started'))

// eslint-disable-next-line no-console
client.on('error', console.error)

function isAfkChannel(voiceChannel) {
  return !!voiceChannel && client.guilds.cache.some(({ afkChannelId }) => afkChannelId === voiceChannel.id)
}

async function getBotMembersInChannel(voiceChannel) {
  await voiceChannel.guild.members.fetch()
  return voiceChannel.members.filter(({ user }) => user.bot && user.id === botId)
}

async function isBotInChannel(voiceChannel) {
  return !![...(await getBotMembersInChannel(voiceChannel)).values()].length
}

async function unmuteBotInAfkChannel(voiceChannel) {
  (await getBotMembersInChannel(voiceChannel)).forEach(member => {
    member.voice.setMute(false)
  })
}

const playFileIndefinitely = connection => {
  const resource = createAudioResource(FILE_PATH)
  audioPlayer.play(resource)
  connection.subscribe(audioPlayer)
}

const joinChannelAndPlayIndefinitely = async voiceChannel => {
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
    setMute: false
  })
  await unmuteBotInAfkChannel(voiceChannel)
  playFileIndefinitely(connection)
}

const respondToAfkChannelJoin = async ({ voice, guild, user }) => {
  db.startAfkSessionForUser({ userId: user.id, guildId: guild.id, timeEntered: new Date() })
  if (!(await isBotInChannel(voice.channel))) {
    await joinChannelAndPlayIndefinitely(voice.channel)
  }
}

async function assignRole(guild, channel) {
  const [longestAfkSession] = db.getLongestAfkSessionsForGuild(guild.id, 1)
  const roleId = db.getHighScoreRoleForGuild(guild.id)
  if (!roleId) {
    const role = await guild.roles.create({
      name: 'Cuban Pete World Champion',
      hoist: true,
      mentionable: true
    })

    db.setHighScoreRoleForGuild(guild.id, role.id)
    const member = guild.members.cache.find(({ id }) => id === longestAfkSession.userId)
    await member.roles.add(role.id)
    await channel.send({ content: `<@${member.id}> has been declared <@&${role.id}>!` })
  } else {
    const role = guild.roles.cache.find(({ id }) => id === roleId)
    const previousChampion = role.members.first()
    if (previousChampion.id !== longestAfkSession.userId) {
      previousChampion.roles.remove(role.id)
      const currentChampion = guild.members.cache.find(({ id }) => id === longestAfkSession.userId)
      await currentChampion.roles.add(role.id)
      await channel.send({ content: `<@${currentChampion.id}> has claimed the title of <@&${role.id}> from <@${previousChampion.id}>!` })
    } else {
      return { championId: previousChampion.id, roleId }
    }
  }

  return null
}

const sendAfkTime = async ({ guild, user }) => {
  const id = db.endAfkSessionForUser({ userId: user.id, timeExited: new Date(), guildId: guild.id })

  const { timeEntered, timeExited } = db.getAfkSessionById(id)
  const totalAFKTime = countdown(timeEntered, timeExited, COUNTDOWN_UNITS)

  const textChannels = guild.channels.cache.filter(({ type }) => type === ChannelType.GuildText)
  const generalChannel = textChannels.find(({ name }) => name.includes('general')) || textChannels.first()

  await generalChannel.send({ content: `<@${user.id}> You were Cuban Pete'd for ${totalAFKTime.toString()}` })

  await assignRole(guild, generalChannel)
}

client.on('voiceStateUpdate', async (oldState, newState) => {
  const oldGuildMember = oldState.member
  const oldVoiceChannel = oldState.channel
  const newGuildMember = newState.member
  const newVoiceChannel = newState.channel

  if (newGuildMember.user.bot || oldGuildMember.user.bot || newVoiceChannel === oldVoiceChannel) return

  if (isAfkChannel(newVoiceChannel)) {
    await respondToAfkChannelJoin(newGuildMember)
  } else if (isAfkChannel(oldVoiceChannel) && !oldGuildMember.user.bot) {
    await sendAfkTime(oldGuildMember)

    if (oldVoiceChannel.members.size === 1) {
      const connection = getVoiceConnection(oldVoiceChannel.guildId)
      connection.destroy()
    }
  }
})

audioPlayer.on('stateChange', (oldState, newState) => {
  if (audioPlayer.subscribers.length && oldState.status === AudioPlayerStatus.Playing && newState.status === AudioPlayerStatus.Idle) {
    const resource = createAudioResource(FILE_PATH)
    audioPlayer.play(resource)
  }
})

client.on('messageCreate', async ({ guild, content, channel }) => {
  if (content === '!leaderboard') {
    const NUMBER_OF_SESSIONS = 5

    const afkSessions = db.getLongestAfkSessionsForGuild(guild.id, NUMBER_OF_SESSIONS)

    const embed = {
      color: 6875242,
      title: `Top ${NUMBER_OF_SESSIONS} Cuban Petes for ${guild.name}`,
      fields: afkSessions.map(({ userId, totalTime }, i) => ({
        name: `${i + 1}.`,
        value: `<@${userId}>: ${countdown(totalTime, COUNTDOWN_UNITS).toString()}`
      }))
    }

    await channel.send({ embeds: [embed] })
  } else if (content === '!highscore') {
    const { championId, roleId } = await assignRole(guild, channel) || {}
    if (championId) {
      await channel.send({ content: `<@${championId}> is the <@&${roleId}>!` })
    }
  }
})
