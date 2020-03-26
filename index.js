const Discord = require('discord.js')
const { botId, token } = require('./config.json')
const countdown = require('countdown')
const Database = require('./database')

const FILE_PATH = './cuban-pete.mp3'

const client = new Discord.Client()
const db = new Database()
const COUNTDOWN_UNITS = countdown.HOURS | countdown.MINUTES | countdown.SECONDS

client.login(token)
  .then(() => console.log('Started'))

client.on('error', console.error)

client.on('voiceStateUpdate', (oldGuildMember, newGuildMember) => {
  const { user: oldUser, voiceChannel: oldVoiceChannel } = oldGuildMember
  const { user: newUser, voiceChannel: newVoiceChannel } = newGuildMember

  if (newUser.bot || oldUser.bot || newVoiceChannel === oldVoiceChannel) return

  if (isAfkChannel(newVoiceChannel)) {
    respondToAfkChannelJoin(newGuildMember)
  } else if (isAfkChannel(oldVoiceChannel) && !oldUser.bot) {
    sendAfkTime(oldGuildMember)
  }
})

const respondToAfkChannelJoin = ({ voiceChannel, guild, user }) => {
  db.startAfkSessionForUser({ userId: user.id, guildId: guild.id, timeEntered: new Date() })
  if (!isBotInChannel(voiceChannel)) {
    joinChannelAndPlayIndefinitely(voiceChannel)
  }
}

const joinChannelAndPlayIndefinitely = voiceChannel => {
  voiceChannel.join()
    .then(connection => {
      unmuteBotInAfkChannel(voiceChannel)
      playFileIndefinitely(connection)
    })
}

const playFileIndefinitely = connection => {
  const dispatcher = connection.playFile(FILE_PATH)
  dispatcher.on('end', () => {
    if (connection.channel.members.array().length > 1) {
      playFileIndefinitely(connection)
    } else {
      setTimeout(() => connection.disconnect(), 1000)
    }
  })
}

const sendAfkTime = ({ guild, user }) => {
  var id = db.endAfkSessionForUser({ userId: user.id, timeExited: new Date(), guildId: guild.id })

  const { timeEntered, timeExited } = db.getAfkSessionById(id)
  const totalAFKTime = countdown(timeEntered, timeExited, COUNTDOWN_UNITS)

  const textChannels = guild.channels.filter(({ type }) => type === 'text')
  const generalChannel = textChannels.find(({ name }) => name.includes('general')) || textChannels.first()

  generalChannel.send(`You were Cuban Pete'd for ${totalAFKTime.toString()}`, { reply: user })
}

const isAfkChannel = voiceChannel =>
  !!voiceChannel && client.guilds.some(({ afkChannelID }) => afkChannelID === voiceChannel.id)

const isBotInChannel = voiceChannel =>
  !!getBotMembersInChannel(voiceChannel).array().length

const getBotMembersInChannel = ({ members }) =>
  members.filter(({ user }) => user.bot && user.id === botId)

const unmuteBotInAfkChannel = voiceChannel =>
  getBotMembersInChannel(voiceChannel).forEach(member => member.setMute(false))
