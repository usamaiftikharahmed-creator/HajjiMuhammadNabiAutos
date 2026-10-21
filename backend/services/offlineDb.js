import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Workspace Root & Data Directories
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');
const candidateDataDirs = [
  path.join(WORKSPACE_ROOT, 'Haji Muhammad Nabi Autos', 'data'),
  path.resolve(__dirname, '..', '..', 'Haji Muhammad Nabi Autos', 'data'),
  path.resolve(__dirname, '..', 'data'),
  path.resolve(__dirname, 'data')
];

export const getDataDir = () => {
  for (const d of candidateDataDirs) {
    if (fs.existsSync(d)) return d;
  }
  const defaultDir = candidateDataDirs[0];
  try {
    fs.mkdirSync(defaultDir, { recursive: true });
  } catch (e) {}
  return defaultDir;
};

export const getBackupDir = () => {
  const dataDir = getDataDir();
  const parent = path.dirname(dataDir);
  const backupDir = path.join(parent, 'backup');
  if (!fs.existsSync(backupDir)) {
    try {
      fs.mkdirSync(backupDir, { recursive: true });
    } catch (e) {}
  }
  return backupDir;
};

// Generate 24-character hexadecimal ObjectId compatible with MongoDB
export const generateId = () => crypto.randomBytes(12).toString('hex');

// In-Memory cache of all collections
export const cache = {
  users: [],
  customers: [],
  installmentSales: [],
  payments: [],
  expenses: [],
  dailyClosings: [],
  activityLogs: [],
  backupSettings: []
};

// Collection mapping to filenames
const collectionFiles = {
  users: 'users.json',
  customers: 'customers.json',
  installmentSales: 'installmentSales.json',
  payments: 'payments.json',
  expenses: 'expenses.json',
  dailyClosings: 'dailyClosings.json',
  activityLogs: 'activityLogs.json',
  backupSettings: 'backupSettings.json'
};

// Google Drive Sync detection
export const syncToGoogleDrive = (fileName, jsonContent) => {
  const gDrivePaths = [
    'G:\\My Drive\\Haji Muhammad Nabi Autos\\data',
    'G:\\My Drive\\Haji Muhammad Nabi Autos',
    'D:\\Google Drive\\Haji Muhammad Nabi Autos\\data',
    'C:\\Users\\usama iftikhar\\Google Drive\\Haji Muhammad Nabi Autos\\data'
  ];
  for (const gPath of gDrivePaths) {
    try {
      if (fs.existsSync(path.dirname(gPath))) {
        if (!fs.existsSync(gPath)) fs.mkdirSync(gPath, { recursive: true });
        fs.writeFileSync(path.join(gPath, fileName), jsonContent, 'utf-8');
      }
    } catch (e) {}
  }
};

// Load all collections from disk into RAM
export const loadAllData = () => {
  const dataDir = getDataDir();
  for (const [colName, fileName] of Object.entries(collectionFiles)) {
    const filePath = path.join(dataDir, fileName);
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        cache[colName] = JSON.parse(raw || '[]');
      } catch (err) {
        console.error(`⚠️ Error reading ${fileName}:`, err.message);
        cache[colName] = [];
      }
    } else {
      cache[colName] = [];
      try {
        fs.writeFileSync(filePath, '[]', 'utf-8');
      } catch (e) {}
    }
  }

  // Ensure default Admin exists in users with bcrypt hash
  const adminUser = cache.users.find(u => u.username === 'admin');
  if (!adminUser) {
    const hash = bcrypt.hashSync('admin123', 10);
    const newAdmin = {
      _id: generateId(),
      name: 'System Owner',
      username: 'admin',
      password: hash,
      role: 'owner',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      __v: 0
    };
    cache.users.push(newAdmin);
    saveCollection('users');
    console.log('✅ Local Admin initialized in offline JSON database (admin / admin123)');
  } else if (!adminUser.password) {
    adminUser.password = bcrypt.hashSync('admin123', 10);
    saveCollection('users');
  }

  console.log(`⚡ Offline JSON Database Loaded: ${cache.customers.length} customers, ${cache.installmentSales.length} sales, ${cache.payments.length} payments, ${cache.users.length} users.`);
};

// Persist collection to disk and mirror to Google Drive
export const saveCollection = (colName) => {
  const dataDir = getDataDir();
  const fileName = collectionFiles[colName];
  if (!fileName) return;

  const filePath = path.join(dataDir, fileName);
  try {
    const jsonStr = JSON.stringify(cache[colName], null, 2);
    fs.writeFileSync(filePath, jsonStr, 'utf-8');
    syncToGoogleDrive(fileName, jsonStr);
    updateSummary();
  } catch (err) {
    console.error(`❌ Failed to save collection ${colName}:`, err.message);
  }
};

// Update summary.json for Google Drive status
export const updateSummary = () => {
  const dataDir = getDataDir();
  const summary = {
    systemName: 'Hajji Mohammad Nabi Autos - Installment & Roznamcha System',
    targetEmail: 'hajjimuhammadnabi@gmail.com',
    storageQuota: '200 GB Google One Drive',
    lastSyncedAt: new Date().toISOString(),
    counts: {
      customers: cache.customers.length,
      installmentSales: cache.installmentSales.length,
      payments: cache.payments.length,
      expenses: cache.expenses.length,
      dailyClosings: cache.dailyClosings.length,
      users: cache.users.length
    },
    status: 'Live JSON Database Active',
    offlineEngine: 'Active (100% Offline Capable)'
  };
  try {
    const summaryStr = JSON.stringify(summary, null, 2);
    fs.writeFileSync(path.join(dataDir, 'summary.json'), summaryStr, 'utf-8');
    syncToGoogleDrive('summary.json', summaryStr);
  } catch (e) {}
};

// Query filter matcher
const matchFilter = (item, filter = {}) => {
  if (!filter || Object.keys(filter).length === 0) return true;

  for (const [key, val] of Object.entries(filter)) {
    if (key === '$or' && Array.isArray(val)) {
      const orMatched = val.some(subFilter => matchFilter(item, subFilter));
      if (!orMatched) return false;
      continue;
    }

    let itemVal = item[key];
    if (key === '_id' && itemVal && typeof itemVal === 'object') {
      itemVal = itemVal.toString();
    }

    if (val && typeof val === 'object' && !(val instanceof RegExp) && !(val instanceof Date)) {
      if ('$gte' in val || '$lte' in val || '$gt' in val || '$lt' in val) {
        const itemDate = new Date(itemVal).getTime();
        if ('$gte' in val && itemDate < new Date(val.$gte).getTime()) return false;
        if ('$lte' in val && itemDate > new Date(val.$lte).getTime()) return false;
        if ('$gt' in val && itemDate <= new Date(val.$gt).getTime()) return false;
        if ('$lt' in val && itemDate >= new Date(val.$lt).getTime()) return false;
        continue;
      }
      if ('$ne' in val && String(itemVal) === String(val.$ne)) return false;
      if ('$in' in val && Array.isArray(val.$in)) {
        const inMatch = val.$in.some(v => String(v) === String(itemVal));
        if (!inMatch) return false;
        continue;
      }
      if ('$regex' in val) {
        const reg = new RegExp(val.$regex, val.$options || 'i');
        if (!reg.test(String(itemVal || ''))) return false;
        continue;
      }
    }

    if (val instanceof RegExp) {
      if (!val.test(String(itemVal || ''))) return false;
      continue;
    }

    const expectedStr = String(val?._id || val);
    const actualStr = String(itemVal?._id || itemVal);
    if (actualStr !== expectedStr) {
      return false;
    }
  }

  return true;
};

// Wrap document with Mongoose-like methods (comparePassword, save, _id.toString)
export const wrapDoc = (doc, colName) => {
  if (!doc) return null;

  const clone = { ...doc };
  const idStr = String(clone._id);

  clone._id = {
    toString: () => idStr,
    equals: (other) => idStr === String(other?._id || other),
    valueOf: () => idStr,
    [Symbol.toPrimitive]: () => idStr
  };
  Object.defineProperty(clone, 'id', { get: () => idStr, configurable: true });

  if (colName === 'users') {
    clone.comparePassword = async function (candidatePassword) {
      if (!this.password) return false;
      return await bcrypt.compare(candidatePassword, this.password);
    };
  }

  clone.save = async function () {
    const list = cache[colName] || [];
    const idx = list.findIndex(d => String(d._id) === idStr);
    const plain = { ...this };
    plain._id = idStr;
    plain.updatedAt = new Date().toISOString();
    delete plain.save;
    delete plain.comparePassword;
    delete plain.id;

    if (idx !== -1) {
      list[idx] = plain;
    } else {
      list.push(plain);
    }
    saveCollection(colName);
    return wrapDoc(plain, colName);
  };

  return clone;
};

// Full sales aggregation with customer and payments lookup (identical to DB aggregate)
export const getAggregatedSales = () => {
  const sales = (cache.installmentSales || []).map(s => {
    const custId = String(s.customer?._id || s.customer || '');
    const customer = cache.customers.find(c => String(c._id) === custId) || null;
    const saleId = String(s._id);
    const payments = (cache.payments || [])
      .filter(p => String(p.installmentSale?._id || p.installmentSale) === saleId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(p => ({
        installmentSale: p.installmentSale,
        customer: p.customer,
        amountPaid: p.amountPaid,
        paymentMethod: p.paymentMethod,
        forMonth: p.forMonth,
        transactionId: p.transactionId,
        notes: p.notes,
        createdAt: p.createdAt,
        _id: p._id
      }));

    const finalPic = s.profilePic || customer?.profilePic || '';
    return {
      ...s,
      profilePic: finalPic,
      customer: customer ? wrapDoc({ ...customer, profilePic: customer.profilePic || finalPic }, 'customers') : null,
      payments
    };
  });

  return sales.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

// Local Collection Interface mirroring Mongoose API
export class OfflineCollection {
  constructor(name) {
    this.name = name;
  }

  get items() {
    return cache[this.name] || [];
  }

  find(filter = {}) {
    let results = this.items.filter(item => matchFilter(item, filter)).map(d => wrapDoc(d, this.name));

    const queryObj = {
      _results: results,
      populate: function (pathOpts, selectFields) {
        const path = typeof pathOpts === 'string' ? pathOpts : pathOpts?.path;
        const nestedPopulate = pathOpts?.populate;

        this._results.forEach(item => {
          if (!item[path]) return;
          const refId = String(item[path]?._id || item[path]);
          let targetCol = null;
          if (path === 'customer') targetCol = 'customers';
          if (path === 'installmentSale') targetCol = 'installmentSales';
          if (path === 'receivedBy' || path === 'createdBy' || path === 'closedBy' || path === 'recordedBy') targetCol = 'users';

          if (targetCol && cache[targetCol]) {
            const found = cache[targetCol].find(t => String(t._id) === refId);
            if (found) {
              let populated = { ...found };
              if (nestedPopulate && populated[nestedPopulate.path]) {
                const nestedRefId = String(populated[nestedPopulate.path]?._id || populated[nestedPopulate.path]);
                const nestedCol = nestedPopulate.path === 'customer' ? 'customers' : 'installmentSales';
                const nestedFound = cache[nestedCol]?.find(n => String(n._id) === nestedRefId);
                if (nestedFound) populated[nestedPopulate.path] = { ...nestedFound };
              }
              item[path] = wrapDoc(populated, targetCol);
            }
          }
        });
        return this;
      },
      sort: function (sortObj = {}) {
        const [field, dir] = Object.entries(sortObj)[0] || ['createdAt', -1];
        const multiplier = dir === -1 || dir === 'desc' ? -1 : 1;
        this._results.sort((a, b) => {
          const valA = a[field] || '';
          const valB = b[field] || '';
          if (valA < valB) return -1 * multiplier;
          if (valA > valB) return 1 * multiplier;
          return 0;
        });
        return this;
      },
      select: function (fields) {
        if (!fields) return this;
        const exclusions = fields.split(' ').filter(f => f.startsWith('-')).map(f => f.slice(1));
        if (exclusions.length > 0) {
          this._results = this._results.map(r => {
            const copy = { ...r };
            exclusions.forEach(ex => delete copy[ex]);
            return copy;
          });
        }
        return this;
      },
      limit: function (n) {
        this._results = this._results.slice(0, n);
        return this;
      },
      skip: function (n) {
        this._results = this._results.slice(n);
        return this;
      },
      lean: function () {
        return this;
      },
      then: function (resolve, reject) {
        return Promise.resolve(this._results).then(resolve, reject);
      }
    };

    return queryObj;
  }

  findOne(filter = {}) {
    const query = this.find(filter);
    const originalThen = query.then.bind(query);
    query.then = function (resolve, reject) {
      return originalThen(results => (results && results.length > 0 ? results[0] : null)).then(resolve, reject);
    };
    return query;
  }

  findById(id) {
    return this.findOne({ _id: String(id) });
  }

  async create(data) {
    const list = Array.isArray(data) ? data : [data];
    const created = [];

    for (const item of list) {
      const doc = {
        _id: item._id ? String(item._id) : generateId(),
        ...item,
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        __v: 0
      };

      if (this.name === 'users' && doc.password && !doc.password.startsWith('$2')) {
        doc.password = await bcrypt.hash(doc.password, 10);
      }

      this.items.push(doc);
      created.push(wrapDoc(doc, this.name));
    }

    saveCollection(this.name);
    return Array.isArray(data) ? created : created[0];
  }

  async findByIdAndUpdate(id, update, options = {}) {
    const idStr = String(id);
    const idx = this.items.findIndex(d => String(d._id) === idStr);
    if (idx === -1) {
      if (options.upsert) {
        return this.create({ _id: idStr, ...(update.$set || update) });
      }
      return null;
    }

    const current = this.items[idx];
    const updated = { ...current };

    if (update.$set) {
      Object.assign(updated, update.$set);
    } else if (update.$inc) {
      for (const [k, v] of Object.entries(update.$inc)) {
        updated[k] = (Number(updated[k]) || 0) + Number(v);
      }
    } else if (update.$push) {
      for (const [k, v] of Object.entries(update.$push)) {
        updated[k] = Array.isArray(updated[k]) ? [...updated[k], v] : [v];
      }
    } else {
      Object.assign(updated, update);
    }

    updated.updatedAt = new Date().toISOString();
    this.items[idx] = updated;
    saveCollection(this.name);

    return wrapDoc(updated, this.name);
  }

  async updateOne(filter, update, options = {}) {
    const found = await this.findOne(filter);
    if (!found) return { matchedCount: 0, modifiedCount: 0 };
    await this.findByIdAndUpdate(found._id, update, options);
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async updateMany(filter, update, options = {}) {
    let matchedCount = 0;
    let modifiedCount = 0;
    for (let i = 0; i < this.items.length; i++) {
      if (matchFilter(this.items[i], filter)) {
        matchedCount++;
        const current = this.items[i];
        const updated = { ...current };
        if (update.$set) {
          Object.assign(updated, update.$set);
        } else if (update.$inc) {
          for (const [k, v] of Object.entries(update.$inc)) {
            updated[k] = (Number(updated[k]) || 0) + Number(v);
          }
        } else if (update.$push) {
          for (const [k, v] of Object.entries(update.$push)) {
            updated[k] = Array.isArray(updated[k]) ? [...updated[k], v] : [v];
          }
        } else {
          Object.assign(updated, update);
        }
        updated.updatedAt = new Date().toISOString();
        this.items[i] = updated;
        modifiedCount++;
      }
    }
    if (modifiedCount > 0) {
      saveCollection(this.name);
    }
    return { matchedCount, modifiedCount };
  }

  async deleteOne(filter) {
    const idx = this.items.findIndex(d => matchFilter(d, filter));
    if (idx !== -1) {
      this.items.splice(idx, 1);
      saveCollection(this.name);
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  }

  async deleteMany(filter = {}) {
    const initialLen = this.items.length;
    const remaining = this.items.filter(d => !matchFilter(d, filter));
    const deletedCount = initialLen - remaining.length;
    if (deletedCount > 0) {
      this.items.length = 0;
      this.items.push(...remaining);
      saveCollection(this.name);
    }
    return { deletedCount };
  }

  async findByIdAndDelete(id) {
    return this.deleteOne({ _id: String(id) });
  }

  async countDocuments(filter = {}) {
    return this.items.filter(item => matchFilter(item, filter)).length;
  }

  async aggregate(pipeline = []) {
    // If aggregate has $lookup on InstallmentSale, return full aggregated sales
    if (this.name === 'installmentSales') {
      return getAggregatedSales();
    }

    let result = [...this.items];
    for (const stage of pipeline) {
      if (stage.$match) {
        result = result.filter(item => matchFilter(item, stage.$match));
      }
      if (stage.$group) {
        const sumField = stage.$group.total?.$sum?.replace('$', '');
        const total = result.reduce((acc, curr) => acc + (Number(curr[sumField]) || 0), 0);
        return [{ _id: null, total }];
      }
    }
    return result;
  }
}

// Initial load into RAM
loadAllData();

export const offlineDb = {
  users: new OfflineCollection('users'),
  customers: new OfflineCollection('customers'),
  installmentSales: new OfflineCollection('installmentSales'),
  payments: new OfflineCollection('payments'),
  expenses: new OfflineCollection('expenses'),
  dailyClosings: new OfflineCollection('dailyClosings'),
  activityLogs: new OfflineCollection('activityLogs'),
  backupSettings: new OfflineCollection('backupSettings')
};
