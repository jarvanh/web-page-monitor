import { getDB, ObjectId } from '../lib/index.mjs';
import { CronTime } from '@webest/web-page-monitor-helper';
import { delayedMQSend } from "./rabbitMQ.mjs";
import { getNextStepMinuteTimestamp, getNextTimeSection } from "../helper.mjs";

// if now is 1 minute, then return the first one who matches >= 10:00 
// if now is 6 minute, then return the first one who matches >= 15:00 
let timestampArrayFinderGenerator = (nowTimestamp) => (v) => {
  return (v >= getNextStepMinuteTimestamp(nowTimestamp, 5, 2))
}

let objectIdDaysBefore = (days) => ObjectId.createFromTime( 
  parseInt( ( Date.now() - days * 24 * 60 * 60 * 1000 ) / 1000)
);
async function normalChecker(now, mqConn, mqChannel) {

  now = now || Date.now(); // timestamp

  let db = await getDB();
  if (!db) return;

  let tableName = 'task';

  let finder = timestampArrayFinderGenerator(now);
  return db.collection(tableName).aggregate([
    {
      $match: {
        $and: [
          {
            nextExecuteTime: {
              $gte: getNextStepMinuteTimestamp(now, 5, 1),
              $lt: getNextStepMinuteTimestamp(now, 5, 2)
            }
          },
          {
            endTime: {
              $gt: new Date(now) //  endTime in DB is a Date type
            }
          },
        ]
      }
      // TODO pagination and be careful for memory leak. future.
    },
    {
      $lookup:
      {
        from: "user",
        localField: "userId",
        foreignField: "_id",
        as: "userInfo"
      }
    },

  ])
  .toArray().then(docs => {
    // TODO
    // if we have same pageURL, then we should merge the 5 minutes' tasks to one pptr task.
    // also need create another data structure to let taskHistory save multiple records for one pptr task.
    if (docs && docs.length) {
      docs.forEach(async (doc) => {
        // generate a random time to balance pptr's tasks
        // we may reboot the server, on 59 minute 40second
        let random15s = Math.floor(Math.random() * 15) * 1000;
        await delayedMQSend({delay: doc.nextExecuteTime - now + random15s, taskDetail:{
          ...doc,
          userInfo: doc.userInfo[0]
        }}, mqConn, mqChannel).catch(err => {console.error(err)});
        db.collection(tableName).updateOne({ _id: doc._id }, {
          '$set': {
            nextExecuteTime: CronTime.getNextTimes(doc.cronSyntax, 5).find(finder)
          }
        }).catch(e => console.error(e))
      });
    }
  }).catch(e => console.error(e));
}

async function errorChecker(now) {

  now = now || Date.now(); // timestamp

  let db = await getDB();
  if (!db) return;

  let tableName = 'task';

  let finder = timestampArrayFinderGenerator(now);

  // https://docs.mongodb.com/v5.0/reference/operator/aggregation-pipeline/
  // https://docs.mongodb.com/v5.0/reference/operator/aggregation/match
  // https://docs.mongodb.com/v5.0/reference/operator/aggregation/lookup/#mongodb-pipeline-pipe.-lookup
  // https://docs.mongodb.com/v5.0/reference/operator/aggregation/lookup/#use--lookup-with--mergeobjects
  // https://docs.mongodb.com/v5.0/reference/operator/aggregation/mergeObjects/#-mergeobjects
  // https://docs.mongodb.com/v5.0/reference/operator/aggregation/replaceRoot/#-replaceroot--aggregation-
  // https://docs.mongodb.com/drivers/node/v4.3/fundamentals/aggregation
  return db.collection(tableName).aggregate([
    {
      $match: {
        $and: [
          {
            nextExecuteTime: {
              $lt: getNextStepMinuteTimestamp(now, 5, 1)
            }
          },
          {
            endTime: {
              $gt: new Date(now) // //  endTime in DB is a Date type
            }
          },
        ]
        // TODO pagination and be careful for memory leak. future.
      },
    },
  ]).toArray().then(docs => {
    if (docs && docs.length) {

      docs.forEach(doc => {
        db.collection(tableName).updateOne({ _id: doc._id }, {
          '$set': {
            nextExecuteTime: CronTime.getNextTimes(doc.cronSyntax, 5).find(finder)
          }
        }).catch(e => console.error(e))
      });
    }
  }).catch(e => console.error(e));

}


export { normalChecker, errorChecker, getNextStepMinuteTimestamp, getNextTimeSection }