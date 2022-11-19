const child_process = require('child_process');
const fs = require('fs');
const winston = require('winston');
const path = require('path');
const { config } = require('./config.js');
const glob = require('glob');

const backupDirectory = path.join(__dirname, 'pg_backups');
if (!fs.existsSync(backupDirectory)){
    fs.mkdirSync(backupDirectory);
}

const format = winston.format.printf(({ level, message, timestamp }) => {
  return `${timestamp} ${level}:: ${message}`;
});
const log = winston.createLogger({
  transports: [
    new winston.transports.Console({}),
    new winston.transports.File({
      maxsize: 5242880,
      maxFiles: 5,
      filename: path.join(__dirname, 'backup.log'),
      level: 'info'
    })
  ],
  format: winston.format.combine(
    winston.format.uncolorize(),
    winston.format.timestamp(),
    format
  )
});

function exec(command) {
  log.info(`Running command: ${command}`);

  try {
    child_process.execSync(command, { stdio: 'inherit' });
  } catch (err) {
    log.error(err);
    throw err;
  }
}

let dateString = (new Date()).toISOString();
dateString = dateString.split('.')[0];
dateString = dateString.replaceAll(':', '-');
const filename = `${dateString}.sql.gz`;

exec(`ssh ${config.hostUser}@${config.hostIp} 'pg_dump --compress=6 ${config.dbName} > ${config.dumpDirectory}/backup.sql.gz'`);
exec(`scp ${config.hostUser}@${config.hostIp}:${config.dumpDirectory}/backup.sql.gz ${backupDirectory}/${filename}`);

function keepMostRecentBackups() {
  const backupsToKeep = parseInt(config.backupsToKeep, 10);
  log.info(`Running keepMostRecentBackups backupsToKeep=${backupsToKeep}`);
  if (!backupsToKeep || isNaN(backupsToKeep)) {
    const error = `backupsToKeep=${config.backupsToKeep} is not a valid value in the config`;
    log.error(error);
    throw new Error(error);
  }

  const backups = glob.sync(`${backupDirectory}/*.sql.gz`);
  const ctimes = new Map();
  for (const backup of backups) {
    const { ctime } = fs.statSync(backup);
    ctimes.set(backup, ctime);
  }

  backups.sort((a, b) => ctimes.get(b) - ctimes.get(a));

  for (let i = backupsToKeep; i < backups.length; ++i) {
    const backup = backups[i];
    log.info(`Deleting backup: ${backup}`);
    fs.unlinkSync(backup);
  }
}

keepMostRecentBackups();
