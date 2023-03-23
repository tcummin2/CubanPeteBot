const { Client, Intents } = require('discord.js')
const countdown = require('countdown')
const Database = require('./database')
const { joinVoiceChannel, createAudioPlayer, NoSubscriberBehavior, createAudioResource, getVoiceConnection, AudioPlayerStatus } = require('@discordjs/voice');
const { botId, token } = require('./config.json')

const FILE_PATH = './cuban-pete.mp3'

const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_BANS,
    Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS,
    Intents.FLAGS.GUILD_INTEGRATIONS,
    Intents.FLAGS.GUILD_WEBHOOKS,
    Intents.FLAGS.GUILD_INVITES,
    Intents.FLAGS.GUILD_VOICE_STATES,
    Intents.FLAGS.GUILD_PRESENCES,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
    Intents.FLAGS.GUILD_MESSAGE_TYPING,
    Intents.FLAGS.DIRECT_MESSAGES,
    Intents.FLAGS.DIRECT_MESSAGE_REACTIONS,
    Intents.FLAGS.DIRECT_MESSAGE_TYPING,
    Intents.FLAGS.MESSAGE_CONTENT,
    Intents.FLAGS.GUILD_SCHEDULED_EVENTS,
    Intents.FLAGS.AUTO_MODERATION_CONFIGURATION,
    Intents.FLAGS.AUTO_MODERATION_EXECUTION
  ]
})
const db = new Database()
const COUNTDOWN_UNITS = countdown.HOURS | countdown.MINUTES | countdown.SECONDS

const player = createAudioPlayer({
	behaviors: {
		noSubscriber: NoSubscriberBehavior.Stop,
	}
})
// const resource = createAudioResource(FILE_PATH)
// player.play(resource)

client.login(token)
  .then(() => console.log('Started'))

client.on('error', console.error)

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

const respondToAfkChannelJoin = async ({ voice, guild, user }) => {
  db.startAfkSessionForUser({ userId: user.id, guildId: guild.id, timeEntered: new Date() })
  if (!(await isBotInChannel(voice.channel))) {
    await joinChannelAndPlayIndefinitely(voice.channel)
  }
}

const joinChannelAndPlayIndefinitely = async voiceChannel => {
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
    setMute: false
  });
  await unmuteBotInAfkChannel(voiceChannel)
  playFileIndefinitely(connection)
}

const playFileIndefinitely = connection => {
  const resource = createAudioResource(FILE_PATH)
  player.play(resource)
  connection.subscribe(player)
}

player.on('stateChange', (oldState, newState) => {
  console.log(`Audio player transitioned from ${oldState.status} to ${newState.status}`);
  if (player.subscribers.length && oldState.status === AudioPlayerStatus.Playing && newState.status === AudioPlayerStatus.Idle) {
    const resource = createAudioResource(FILE_PATH)
    player.play(resource)
  }
});

const sendAfkTime = async ({ guild, user }) => {
  const id = db.endAfkSessionForUser({ userId: user.id, timeExited: new Date(), guildId: guild.id })

  const { timeEntered, timeExited } = db.getAfkSessionById(id)
  const totalAFKTime = countdown(timeEntered, timeExited, COUNTDOWN_UNITS)

  const textChannels = guild.channels.cache.filter(({ type }) => type === 'GUILD_TEXT')
  const generalChannel = textChannels.find(({ name }) => name.includes('general')) || textChannels.first()

  await generalChannel.send({ content: `<@${user.id}> You were Cuban Pete'd for ${totalAFKTime.toString()}` })

  await assignRole(guild, generalChannel)
}

const assignRole = async (guild, channel) => {
  let [longestAfkSession] = db.getLongestAfkSessionsForGuild(guild.id, 1)
  let roleId = db.getHighScoreRoleForGuild(guild.id)
  if (!roleId) {
    const role = await guild.roles.create({
      name: 'Cuban Pete World Champion',
      hoist: true,
      mentionable: true
    })

    db.setHighScoreRoleForGuild(guild.id, role.id)
    let member = guild.members.cache.find(({ id }) => id === longestAfkSession.userId)
    await member.roles.add(role.id)
    await channel.send({ content: `<@${member.id}> has been declared <@&${role.id}>!` })
  } else {
    let role = guild.roles.cache.find(role => role.id === roleId)
    let previousChampion = role.members.first()
    if (previousChampion.id !== longestAfkSession.userId) {
      previousChampion.roles.remove(role.id)
      let currentChampion = guild.members.cache.find(({ id }) => id === longestAfkSession.userId)
      await currentChampion.roles.add(role.id)
      await channel.send({ content: `<@${currentChampion.id}> has claimed the title of <@&${role.id}> from <@${previousChampion.id}>!` })
    } else {
      return { championId: previousChampion.id, roleId }
    }
  }
}

const isAfkChannel = voiceChannel =>
  !!voiceChannel && client.guilds.cache.some(({ afkChannelId }) => afkChannelId === voiceChannel.id)

const isBotInChannel = async voiceChannel =>
  !![...(await getBotMembersInChannel(voiceChannel)).values()].length

const getBotMembersInChannel = async voiceChannel => {
  await voiceChannel.guild.members.fetch()
  return voiceChannel.members.filter(({ user }) => {
    return user.bot && user.id === botId
  })
}

const unmuteBotInAfkChannel = async voiceChannel => {
  (await getBotMembersInChannel(voiceChannel)).forEach(member => {
    member.voice.setMute(false)
  })
}

client.on('messageCreate', async ({ guild, content, channel }) => {
  if (content === '!leaderboard') {
    const NUMBER_OF_SESSIONS = 5

    let afkSessions = db.getLongestAfkSessionsForGuild(guild.id, NUMBER_OF_SESSIONS)

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
    let { championId, roleId } = await assignRole(guild, channel) || {}
    if (championId) {
      await channel.send({ content: `<@${championId}> is the <@&${roleId}>!` })
    }
  }
})