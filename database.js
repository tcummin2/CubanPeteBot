const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const shortid = require('shortid')

const adapter = new FileSync('db.json')

class Database {
  constructor() {
    this.db = low(adapter)
    this.db.defaults({ afkSessions: [], highScoreRoleByGuild: {} })
      .write()
  }

  useAfkSessionsTable() {
    return this.db.get('afkSessions')
  }

  startAfkSessionForUser({ userId, guildId, timeEntered}) {
    const id = shortid.generate()
    this.useAfkSessionsTable()
      .push({ id, userId, guildId, timeEntered, timeExited: null })
      .write()

    return id
  }

  getAfkSessionById(id) {
    return this.useAfkSessionsTable()
      .find({ id })
      .value()
  }

  getCurrentAfkSessionForUser(userId, guildId) {
    return this.useAfkSessionsTable()
      .find({ userId, guildId, timeExited: null })
      .value()
  }

  endAfkSessionForUser({ userId, guildId, timeExited }) {
    const { id } = this.getCurrentAfkSessionForUser(userId, guildId)

    this.useAfkSessionsTable()
      .find({ id })
      .assign({ timeExited })
      .write()

    return id
  }

  getLongestAfkSessionsForGuild(guildId, numberOfSessions) {
    const allSessions = this.useAfkSessionsTable()
      .filter({ guildId })
      .filter(session => session.timeExited)
      .value()

    allSessions.forEach(session => {
      session.totalTime = new Date(session.timeExited) - new Date(session.timeEntered)
    })

    allSessions.sort((session1, session2) => session1.totalTime - session2.totalTime)
    allSessions.reverse()

    return allSessions.slice(0, numberOfSessions)
  }

  getHighScoreRoleForGuild(guildId) {
    var highScoreRoles = this.db.get('highScoreRoleByGuild').value()

    return highScoreRoles[guildId]
  }

  setHighScoreRoleForGuild(guildId, roleId) {
    this.db.get('highScoreRoleByGuild')
      .assign({ [guildId]: roleId })
      .write()
  }
}

module.exports = Database