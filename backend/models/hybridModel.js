import mongoose from 'mongoose';
import { offlineDb, wrapDoc, generateId } from '../services/offlineDb.js';

export const createHybridModel = (MongooseModel, colName) => {
  const offlineCol = offlineDb[colName];

  return new Proxy(MongooseModel, {
    construct(target, argArray, newTarget) {
      if (mongoose.connection.readyState === 1) {
        try {
          return Reflect.construct(target, argArray, newTarget);
        } catch (e) {}
      }
      const data = argArray[0] || {};
      const doc = {
        _id: data._id ? String(data._id) : generateId(),
        ...data,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        __v: 0
      };
      return wrapDoc(doc, colName);
    },
    get(target, prop) {
      const isOnline = mongoose.connection.readyState === 1;

      // Intercept creation
      if (prop === 'create') {
        return async function (...args) {
          if (isOnline) {
            try {
              const res = await target.create(...args);
              // Mirror write to offline DB
              try {
                const plain = JSON.parse(JSON.stringify(res));
                await offlineCol.create(plain);
              } catch (e) {}
              return res;
            } catch (err) {
              console.warn(`[Offline Fallback] Mongoose create failed, using local DB:`, err.message);
              return await offlineCol.create(...args);
            }
          }
          return await offlineCol.create(...args);
        };
      }

      // Intercept find
      if (prop === 'find') {
        return function (...args) {
          if (isOnline) {
            try {
              const query = target.find(...args);
              const originalExec = query.exec.bind(query);
              query.exec = async function () {
                try {
                  return await originalExec();
                } catch (err) {
                  console.warn(`[Offline Fallback] Mongoose find failed, using local DB:`, err.message);
                  return await offlineCol.find(...args);
                }
              };
              return query;
            } catch (e) {
              return offlineCol.find(...args);
            }
          }
          return offlineCol.find(...args);
        };
      }

      // Intercept findOne
      if (prop === 'findOne') {
        return function (...args) {
          if (isOnline) {
            try {
              const query = target.findOne(...args);
              const originalExec = query.exec.bind(query);
              query.exec = async function () {
                try {
                  return await originalExec();
                } catch (err) {
                  console.warn(`[Offline Fallback] Mongoose findOne failed, using local DB:`, err.message);
                  return await offlineCol.findOne(...args);
                }
              };
              return query;
            } catch (e) {
              return offlineCol.findOne(...args);
            }
          }
          return offlineCol.findOne(...args);
        };
      }

      // Intercept findById
      if (prop === 'findById') {
        return function (...args) {
          if (isOnline) {
            try {
              const query = target.findById(...args);
              const originalExec = query.exec.bind(query);
              query.exec = async function () {
                try {
                  return await originalExec();
                } catch (err) {
                  console.warn(`[Offline Fallback] Mongoose findById failed, using local DB:`, err.message);
                  return await offlineCol.findById(...args);
                }
              };
              return query;
            } catch (e) {
              return offlineCol.findById(...args);
            }
          }
          return offlineCol.findById(...args);
        };
      }

      // Intercept findByIdAndUpdate
      if (prop === 'findByIdAndUpdate') {
        return async function (...args) {
          if (isOnline) {
            try {
              const res = await target.findByIdAndUpdate(...args);
              offlineCol.findByIdAndUpdate(...args).catch(() => {});
              return res;
            } catch (err) {
              console.warn(`[Offline Fallback] Mongoose update failed, using local DB:`, err.message);
              return await offlineCol.findByIdAndUpdate(...args);
            }
          }
          return await offlineCol.findByIdAndUpdate(...args);
        };
      }

      // Intercept updateOne
      if (prop === 'updateOne') {
        return async function (...args) {
          if (isOnline) {
            try {
              const res = await target.updateOne(...args);
              offlineCol.updateOne(...args).catch(() => {});
              return res;
            } catch (err) {
              return await offlineCol.updateOne(...args);
            }
          }
          return await offlineCol.updateOne(...args);
        };
      }

      // Intercept updateMany
      if (prop === 'updateMany') {
        return async function (...args) {
          if (isOnline) {
            try {
              const res = await target.updateMany(...args);
              offlineCol.updateMany(...args).catch(() => {});
              return res;
            } catch (err) {
              return await offlineCol.updateMany(...args);
            }
          }
          return await offlineCol.updateMany(...args);
        };
      }

      // Intercept deleteOne & findByIdAndDelete
      if (prop === 'deleteOne' || prop === 'findByIdAndDelete') {
        return async function (...args) {
          if (isOnline) {
            try {
              const res = await target[prop](...args);
              offlineCol[prop](...args).catch(() => {});
              return res;
            } catch (err) {
              return await offlineCol[prop](...args);
            }
          }
          return await offlineCol[prop](...args);
        };
      }

      // Intercept deleteMany
      if (prop === 'deleteMany') {
        return async function (...args) {
          if (isOnline) {
            try {
              const res = await target.deleteMany(...args);
              offlineCol.deleteMany(...args).catch(() => {});
              return res;
            } catch (err) {
              return await offlineCol.deleteMany(...args);
            }
          }
          return await offlineCol.deleteMany(...args);
        };
      }

      // Intercept countDocuments
      if (prop === 'countDocuments') {
        return async function (...args) {
          if (isOnline) {
            try {
              return await target.countDocuments(...args);
            } catch (err) {
              return await offlineCol.countDocuments(...args);
            }
          }
          return await offlineCol.countDocuments(...args);
        };
      }

      // Intercept aggregate
      if (prop === 'aggregate') {
        return async function (...args) {
          if (isOnline) {
            try {
              return await target.aggregate(...args);
            } catch (err) {
              return await offlineCol.aggregate(...args);
            }
          }
          return await offlineCol.aggregate(...args);
        };
      }

      // Default fallback to Mongoose or offline method
      const orig = target[prop];
      if (typeof orig === 'function') {
        return orig.bind(target);
      }
      return orig;
    }
  });
};
