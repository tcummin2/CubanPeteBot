const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const shortid = require('shortid')

const adapter = new FileSync('db.json')

class Database {
  constructor() {
    this.db = low(adapter)
    this.db.defaults({ afkSessions: [] })
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
}

module.exports = Database