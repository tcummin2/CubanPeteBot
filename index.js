const Discord = require('discord.js')
const Ytdl = require('ytdl-core')
const config = require('./config.json')

const CUBAN_PETE_URL = 'https://www.youtube.com/watch?v=eTI8hgWJh-I'

const client = new Discord.Client()

client.login(config.token)
  .then(() => console.log('Started'))

client.on('voiceStateUpdate', (oldMember, newMember) => {
  var newUserChannel = newMember.voiceChannel
  var isAfkChannel = !!newUserChannel && client.guilds.some(guild => guild.afkChannelID === newUserChannel.id)

  if (isAfkChannel && !newUserChannel.members.some(member => member.user.bot)) {
    newUserChannel.join()
      .then(connection => {
        var bots = connection.channel.members
          .filter(member => member.user.bot)
        bots.forEach(member => member.setMute(false))
        play(connection)
      })
  }
})

function play(connection) {
  var stream = Ytdl(CUBAN_PETE_URL, { filter: 'audioonly'})
  connection.playStream(stream)
    .on('end', () => {
      if (connection.channel.members.array().length > 1) {
        play(connection)
      } else {
        setTimeout(() => connection.disconnect(), 1000)
      }
    })
}

client.on('error', console.error)