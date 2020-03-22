const Discord = require('discord.js')
const { botId, token } = require('./config.json')
const countdown = require('countdown')

const FILE_PATH = './cuban-pete.mp3'

const client = new Discord.Client()
const COUNTDOWN_UNITS = countdown.HOURS | countdown.MINUTES | countdown.SECONDS
const afkTimes = {}

client.login(token)
  .then(() => console.log('Started'))

client.on('error', console.error)

client.on('voiceStateUpdate', (oldGuildMember, newGuildMember) => {
  if (newGuildMember.user.bot || oldGuildMember.user.bot) return

  if (isAfkChannel(newGuildMember.voiceChannel)) {
    respondToAfkChannelJoin(newGuildMember)
  } else if (isAfkChannel(oldGuildMember.voiceChannel) && !oldGuildMember.user.bot) {
    sendAfkTime(oldGuildMember)
  }
})

const respondToAfkChannelJoin = ({ voiceChannel, user }) => {
  afkTimes[user.id] = new Date()
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
  const afkStartTime = afkTimes[user.id]
  if (!afkStartTime) return

  const totalAFKTime = countdown(afkStartTime, new Date(), COUNTDOWN_UNITS)
  delete afkTimes[user.id]

  guild.channels.find(({ type }) => type === 'text')
    .send(`You were Cuban Pete'd for ${totalAFKTime}`, { reply: user })
}

const isAfkChannel = voiceChannel =>
  !!voiceChannel && client.guilds.some(({ afkChannelID }) => afkChannelID === voiceChannel.id)

const isBotInChannel = voiceChannel =>
  !!getBotMembersInChannel(voiceChannel).array().length

const getBotMembersInChannel = ({ members }) =>
  members.filter(({ user }) => user.bot && user.id === botId)

const unmuteBotInAfkChannel = voiceChannel =>
  getBotMembersInChannel(voiceChannel).forEach(member => member.setMute(false))
