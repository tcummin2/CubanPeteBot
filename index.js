const Discord = require('discord.js')
const { botId, token } = require('./config.json')

const FILE_PATH = './cuban-pete.mp3'

const client = new Discord.Client()

client.login(token)
  .then(() => console.log('Started'))

client.on('error', console.error)

client.on('voiceStateUpdate', (_, { voiceChannel }) => {
  if (isAfkChannel(voiceChannel) && !isBotInChannel(voiceChannel)) {
    voiceChannel.join()
      .then(connection => {
        unmuteBotInAfkChannel(voiceChannel)
        playFileIndefinitely(connection)
      })
    }
  })

const playFileIndefinitely = connection => {
  var dispatcher = connection.playFile(FILE_PATH)
  dispatcher.on('end', () => {
    if (connection.channel.members.array().length > 1) {
      playFileIndefinitely(connection)
    } else {
      setTimeout(() => connection.disconnect(), 1000)
    }
  })
}

const isAfkChannel = voiceChannel =>
  !!voiceChannel && client.guilds.some(({ afkChannelID }) => afkChannelID === voiceChannel.id)

const isBotInChannel = voiceChannel =>
  !!getBotMembersInChannel(voiceChannel).array().length

const getBotMembersInChannel = ({ members }) =>
  members.filter(({ user }) => user.bot && user.id === botId)

const unmuteBotInAfkChannel = voiceChannel =>
  getBotMembersInChannel(voiceChannel).forEach(member => member.setMute(false))
