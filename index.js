const Discord = require('discord.js')
const countdown = require('countdown')
const Database = require('./database')
const { botId, token } = require('./config.json')

const FILE_PATH = './cuban-pete.mp3'

const client = new Discord.Client()
const db = new Database()
const COUNTDOWN_UNITS = countdown.HOURS | countdown.MINUTES | countdown.SECONDS

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
  }
})

const respondToAfkChannelJoin = async ({ voice, guild, user }) => {
  db.startAfkSessionForUser({ userId: user.id, guildId: guild.id, timeEntered: new Date() })
  if (!isBotInChannel(voice.channel)) {
    await joinChannelAndPlayIndefinitely(voice.channel)
  }
}

const joinChannelAndPlayIndefinitely = async voiceChannel => {
  const connection = await voiceChannel.join()
  unmuteBotInAfkChannel(voiceChannel)
  playFileIndefinitely(connection)
}

const playFileIndefinitely = connection => {
  const dispatcher = connection.play(FILE_PATH)
  dispatcher.on('finish', () => {
    if (connection.channel.members.size > 1) {
      playFileIndefinitely(connection)
    } else {
      setTimeout(() => connection.disconnect(), 1000)
    }
  })
}

const sendAfkTime = async ({ guild, user }) => {
  const id = db.endAfkSessionForUser({ userId: user.id, timeExited: new Date(), guildId: guild.id })

  const { timeEntered, timeExited } = db.getAfkSessionById(id)
  const totalAFKTime = countdown(timeEntered, timeExited, COUNTDOWN_UNITS)

  const textChannels = guild.channels.cache.filter(({ type }) => type === 'text')
  const generalChannel = textChannels.find(({ name }) => name.includes('general')) || textChannels.first()

  await generalChannel.send(`You were Cuban Pete'd for ${totalAFKTime.toString()}`, { reply: user })
  await assignRole(guild, generalChannel)
}

const assignRole = async (guild, channel) => {
  let [longestAfkSession] = db.getLongestAfkSessionsForGuild(guild.id, 1)
  let roleId = db.getHighScoreRoleForGuild(guild.id)
  if (!roleId) {
    const role = await guild.roles.create({
      data: {
        name: 'Cuban Pete World Champion',
        hoist: true,
        mentionable: true
      }
    })

    db.setHighScoreRoleForGuild(guild.id, role.id)
    let member = guild.members.cache.find(({ id }) => id === longestAfkSession.userId)
    await member.roles.add(role.id)
    await channel.send(`<@${member.id}> has been declared <@&${role.id}>!`)
  } else {
    let role = guild.roles.cache.find(role => role.id === roleId)
    let previousChampion = role.members.first()
    if (previousChampion.id !== longestAfkSession.userId) {
      previousChampion.roles.remove(role.id)
      let currentChampion = guild.members.cache.find(({ id }) => id === longestAfkSession.userId)
      await currentChampion.roles.add(role.id)
      await channel.send(`<@${currentChampion.id}> has claimed the title of <@&${role.id}> from <@${previousChampion.id}>!`)
    } else {
      return { championId: previousChampion.id, roleId }
    }
  }
}

const isAfkChannel = voiceChannel =>
  !!voiceChannel && client.guilds.cache.some(({ afkChannelID }) => afkChannelID === voiceChannel.id)

const isBotInChannel = voiceChannel =>
  !!getBotMembersInChannel(voiceChannel).array().length

const getBotMembersInChannel = ({ members }) =>
  members.filter(({ user }) => user.bot && user.id === botId)

const unmuteBotInAfkChannel = voiceChannel =>
  getBotMembersInChannel(voiceChannel).forEach(member => member.voice.setMute(false))

client.on('message', async ({ guild, content, channel }) => {
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

    await channel.send({ embed })
  } else if (content === '!highscore') {
    let { championId, roleId } = await assignRole(guild, channel) || {}
    if (championId) {
      await channel.send(`<@${championId}> is the <@&${roleId}>!`)
    }
  }
})