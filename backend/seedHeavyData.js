import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/installment_shop';

// ==========================================
// 1. PRODUCTS: ONLY RIKSHAWS & BIKES
// ==========================================
const RIKSHAW_MODELS = [
  { name: "Sazgar 4-Stroke Passenger Auto Rikshaw", basePrice: 490000, advance: 120000 },
  { name: "Sazgar 7-Seater Deluxe Auto Rikshaw", basePrice: 540000, advance: 140000 },
  { name: "New Asia 9-Seater Cargo & Passenger Rikshaw", basePrice: 530000, advance: 130000 },
  { name: "Tezraftar 200cc Heavy Cargo Loader Rikshaw", basePrice: 420000, advance: 100000 },
  { name: "Qingqi 150cc Passenger Rikshaw", basePrice: 340000, advance: 80000 },
  { name: "Road Prince Bullet 200cc Loader Rikshaw", basePrice: 430000, advance: 110000 },
  { name: "Sazgar Royal Deluxe CNG Rikshaw", basePrice: 510000, advance: 125000 },
  { name: "New Asia 150cc Deluxe Auto Cab", basePrice: 470000, advance: 115000 }
];

const BIKE_MODELS = [
  { name: "Honda CD 70cc (Red / Black)", basePrice: 175000, advance: 45000 },
  { name: "Honda CG 125cc Self Start", basePrice: 270000, advance: 70000 },
  { name: "Honda CG 125 Special Edition (Gold)", basePrice: 310000, advance: 85000 },
  { name: "Yamaha YBR 125G Trail Blue Edition", basePrice: 470000, advance: 120000 },
  { name: "Suzuki GS 150 Heavy Cruiser", basePrice: 410000, advance: 100000 },
  { name: "United US 70cc Standard Economy", basePrice: 125000, advance: 30000 },
  { name: "Road Prince 70cc Passion", basePrice: 128000, advance: 32000 },
  { name: "Super Power Deluxe 70cc Euro II", basePrice: 130000, advance: 35000 },
  { name: "Crown 70cc HD Self Start", basePrice: 135000, advance: 35000 }
];

const ALL_PRODUCTS = [...RIKSHAW_MODELS, ...BIKE_MODELS];

// ==========================================
// 2. PAKISTANI NAMES & LOCATIONS
// ==========================================
const FIRST_NAMES = [
  "Muhammad", "Ali", "Ahmed", "Usama", "Tariq", "Bilal", "Hamza", "Rashid",
  "Zeeshan", "Kamran", "Imran", "Farhan", "Kashif", "Asad", "Owais", "Zubair",
  "Fahad", "Nabeel", "Babar", "Rizwan", "Haris", "Shoaib", "Waqas", "Adnan",
  "Faisal", "Salman", "Sohail", "Tanveer", "Junaid", "Khurram", "Arsalan", "Shahzaib",
  "Umair", "Danish", "Nouman", "Rehan", "Saad", "Ammar", "Basit", "Zahid"
];

const LAST_NAMES = [
  "Khan", "Qureshi", "Siddiqui", "Rajput", "Sheikh", "Ansari", "Butt", "Malik",
  "Mughal", "Awan", "Abbasi", "Memon", "Jatoi", "Baloch", "Bhatti", "Chaudhry",
  "Gujjar", "Rehman", "Shah", "Hashmi", "Niazi", "Farooqi", "Afridi", "Tareen"
];

const AREAS = [
  "Surjani Town Sector 4-B", "Nai Abadi Sector 6", "Orangi Town No. 5",
  "Baldia Town Gulshan-e-Ghazi", "Korangi Sector 31-D", "Landhi Labour Square",
  "Malir Kala Board", "Liaquatabad Block 4", "Nazimabad No. 2", "North Karachi Sector 11-A",
  "New Karachi Sector 5-E", "Gulshan-e-Maymar Sector Q", "Shah Faisal Colony No. 3",
  "Lyari Kalakot", "PECHS Block 2", "Federal B Area Block 14"
];

const RELATIONSHIPS = ["Brother", "Father", "Cousin", "Uncle", "Friend", "Neighbor", "Business Partner"];

// Cities for vehicle plates
const CITY_CODES = ["KHI", "LHR", "ISL", "RWP", "HYD", "FSD", "MUL", "PSH", "QTA"];

// Expense Categories
const EXPENSE_CATEGORIES = [
  "Shop Tea & Refreshment", "Generator Petrol & Fuel", "Shop Electricity Bill",
  "Staff Daily Lunch & Water", "Shop Monthly Rent", "Vehicle Loading & Transport",
  "Shop Maintenance & Repairs", "Internet & Telephone Bill", "Stationery & Stamp Papers",
  "Office Cleaning & Sweeper"
];

// Recovery Call Remarks
const PROMISE_REMARKS = [
  "Customer ne 10 tareekh ko tankhwah aane par kist dene ka pukhta wada kiya hai.",
  "Dukan par khud aa kar kal Subah 11 baje payment dene ka wada kiya.",
  "Customer ne kaha bache ki fees thi, 15 tareekh ko 2 kistein ikathi jama karwayega.",
  "Phone par rabta hua, 3 din tak JazzCash / EasyPaisa par payment bhej dega.",
  "Zamin se baat hui hai, usne zimmadari li hai ke peer ke roz payment aa jayegi.",
  "Riksha mechanic ke paas khara tha, 2 din baad chalte hi kist jama karwaye ga."
];

const CRITICAL_REMARKS = [
  "Number mustaqil band ja raha hai, recovery team ko ghar bheja ja raha hai.",
  "2 mahine se kist ada nahi ki, gawah/zamin ko notice issue kar diya gaya hai.",
  "Customer dukan par aya tha lakin payment nahi ki, warning de di gayi hai.",
  "Pichli promise date par payment nahi aayi, strict legal follow-up ki zaroorat hai."
];

// Helper: Random pick
const sample = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Generate 365 Days Array: From Oct 7, 2025 to Oct 7, 2026
function generateDaysArray() {
  const days = [];
  const start = new Date(2025, 9, 7); // Oct 7, 2025
  const end = new Date(2026, 9, 7);   // Oct 7, 2026
  let curr = new Date(start);
  while (curr <= end) {
    days.push(new Date(curr));
    curr.setDate(curr.getDate() + 1);
  }
  return days;
}

// Format date YYYY-MM-DD
function formatDateStr(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function seedHeavyDataset() {
  console.log('===============================================================');
  console.log('🚀 STARTING MASSIVE 10,000+ RECORDS 1-YEAR DATASET SEEDING');
  console.log('   Focus: Rikshaws & Bikes | 6, 10 & 24 Month Plans | Realistic Dues');
  console.log('===============================================================');

  const startTime = Date.now();
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB Atlas Successfully!');

  const db = mongoose.connection.db;

  // 1. Maintain or Create System Admin
  let admin = await db.collection('users').findOne({ username: 'admin' });
  if (!admin) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const res = await db.collection('users').insertOne({
      name: 'System Owner',
      username: 'admin',
      password: hashedPassword,
      role: 'owner',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    admin = { _id: res.insertedId, name: 'System Owner' };
    console.log('✅ Default Admin Created');
  } else {
    console.log('✅ Existing Admin User Preserved (admin / admin123)');
  }
  const adminId = admin._id;

  // 2. Clean Existing Collections (Clean slate for pristine performance testing)
  console.log('\n🧹 Cleaning old test data collections...');
  await Promise.all([
    db.collection('customers').deleteMany({}),
    db.collection('installmentsales').deleteMany({}),
    db.collection('payments').deleteMany({}),
    db.collection('expenses').deleteMany({}),
    db.collection('dailyclosings').deleteMany({}),
    db.collection('activitylogs').deleteMany({})
  ]);
  console.log('✅ Old test records cleaned.');

  const daysList = generateDaysArray();
  console.log(`📅 Generated 1-Year Date Timeline: ${daysList.length} total operational days.`);

  // ==========================================
  // 3. GENERATE 1,500 REALISTIC CUSTOMERS
  // ==========================================
  console.log('\n👤 Generating 1,500 Pakistani Customers with Guarantors...');
  const TOTAL_CUSTOMERS = 1500;
  const customerDocs = [];

  for (let i = 0; i < TOTAL_CUSTOMERS; i++) {
    const cId = `CUST-${1001 + i}`;
    const name = `${sample(FIRST_NAMES)} ${sample(LAST_NAMES)}`;
    const phone = `03${randomInt(10, 49)}${randomInt(1000000, 9999999)}`;
    const phone2 = Math.random() > 0.4 ? `03${randomInt(10, 49)}${randomInt(1000000, 9999999)}` : '';
    const cnic = `42${randomInt(100, 999)}-${randomInt(1000000, 9999999)}-${randomInt(1, 9)}`;
    const address = `House #${randomInt(12, 890)}, Street #${randomInt(1, 24)}, ${sample(AREAS)}`;
    
    const gName = `${sample(FIRST_NAMES)} ${sample(LAST_NAMES)} (${sample(RELATIONSHIPS)})`;
    const gPhone = `03${randomInt(10, 49)}${randomInt(1000000, 9999999)}`;
    const g2Name = `${sample(FIRST_NAMES)} ${sample(LAST_NAMES)} (${sample(RELATIONSHIPS)})`;
    const g2Phone = `03${randomInt(10, 49)}${randomInt(1000000, 9999999)}`;

    // Creation date spread across the 365 days
    const createdDate = daysList[Math.floor((i / TOTAL_CUSTOMERS) * (daysList.length - 1))];

    customerDocs.push({
      _id: new mongoose.Types.ObjectId(),
      customerId: cId,
      name,
      phone,
      phone2,
      cnic,
      address,
      guarantorName: gName,
      guarantorPhone: gPhone,
      guarantor2Name: g2Name,
      guarantor2Phone: g2Phone,
      createdAt: createdDate,
      updatedAt: createdDate,
      __v: 0
    });
  }

  // Insert in batches of 1000
  for (let i = 0; i < customerDocs.length; i += 1000) {
    await db.collection('customers').insertMany(customerDocs.slice(i, i + 1000));
  }
  console.log(`✅ 1,500 Customers Saved to Database.`);

  // ==========================================
  // 4. GENERATE 1,800 INSTALLMENT SALES (RIKSHAWS & BIKES ONLY)
  //    Focus on Promise Months: 6, 10, 24 Months
  // ==========================================
  console.log('\n🛵 Generating 1,800 Installment Sales (Rikshaws & Bikes Only)...');
  const TOTAL_SALES = 1800;
  const salesDocs = [];
  const paymentDocs = [];

  // Distribution of Promise Months as specified by user:
  // ~35% with 6 Months
  // ~35% with 10 Months
  // ~20% with 24 Months
  // ~10% with 12 Months
  const PLAN_OPTIONS = [
    { months: 6, label: "6 Months Plan", weight: 35 },
    { months: 10, label: "10 Months Plan", weight: 35 },
    { months: 24, label: "24 Months Plan", weight: 20 },
    { months: 12, label: "12 Months Plan", weight: 10 }
  ];

  function pickPlan() {
    const roll = randomInt(1, 100);
    if (roll <= 35) return PLAN_OPTIONS[0]; // 6 Months
    if (roll <= 70) return PLAN_OPTIONS[1]; // 10 Months
    if (roll <= 90) return PLAN_OPTIONS[2]; // 24 Months
    return PLAN_OPTIONS[3]; // 12 Months
  }

  const currentDateObj = new Date(2026, 9, 7); // Oct 7, 2026 (Today)

  for (let i = 0; i < TOTAL_SALES; i++) {
    const customer = customerDocs[i % customerDocs.length];
    const isRikshaw = Math.random() < 0.45; // 45% Rikshaws, 55% Bikes
    const product = isRikshaw ? sample(RIKSHAW_MODELS) : sample(BIKE_MODELS);
    const plan = pickPlan();

    // Spread sale creation across the 365 days
    // Older sales towards beginning, newer sales towards now
    const dayIndex = Math.floor((i / TOTAL_SALES) * (daysList.length - 1));
    const saleDate = new Date(daysList[dayIndex]);

    const totalAmount = product.basePrice + randomInt(0, 15) * 1000;
    const advancePayment = product.advance + randomInt(0, 10) * 1000;
    const remainingBalanceAtStart = totalAmount - advancePayment;
    const totalMonths = plan.months;
    const monthlyAmount = Math.round(remainingBalanceAtStart / totalMonths);
    const dueDateDay = sample([5, 10, 15, 20, 25]);

    // Unique Registration, Engine & Chassis Numbers
    const regPrefix = sample(CITY_CODES);
    const regNum = `${regPrefix}-${randomInt(1000, 9999)}`;
    const engineNum = isRikshaw ? `SZ-${randomInt(100000, 999999)}` : `JH07E-${randomInt(100000, 999999)}`;
    const chassisNum = isRikshaw ? `SZC-${randomInt(100000, 999999)}` : `JH07C-${randomInt(100000, 999999)}`;

    // Calculate how many months have elapsed since saleDate up to today
    const monthsElapsed = Math.max(0, 
      (currentDateObj.getFullYear() - saleDate.getFullYear()) * 12 + 
      (currentDateObj.getMonth() - saleDate.getMonth())
    );

    let status = 'active';
    let currentRemaining = remainingBalanceAtStart;
    let promiseDate = null;
    let remarks = '';
    let callStatus = 'PENDING CALL';
    let followUps = [];
    let lastPaymentDate = saleDate;
    let nextDueDate = new Date(saleDate.getFullYear(), saleDate.getMonth() + 1, dueDateDay);

    const saleId = new mongoose.Types.ObjectId();

    // 1. Advance Payment Record (always made on sale date)
    paymentDocs.push({
      _id: new mongoose.Types.ObjectId(),
      installmentSale: saleId,
      customer: customer._id,
      amountPaid: advancePayment,
      paymentMethod: Math.random() < 0.65 ? 'cash' : 'online',
      forMonth: `${MONTH_NAMES[saleDate.getMonth()]} ${saleDate.getFullYear()}`,
      transactionId: `ADV-${randomInt(100000, 999999)}`,
      notes: `Advance Booking for ${product.name}`,
      receivedBy: adminId,
      createdAt: saleDate,
      updatedAt: saleDate,
      __v: 0
    });

    // 2. Decide Account Health / Behavior Category:
    // A: Fully Completed (All installments paid)
    // B: Active & Perfect (Paid on time every month)
    // C: Due Today / This Week (Testing urgent alerts)
    // D: Overdue with Promise Date (Wada kiya hua hai)
    // E: Critical Defaulter (Multiple months missed, legal notice / switched off)
    const categoryRoll = randomInt(1, 100);

    let installmentsToPay = 0;

    if (monthsElapsed >= totalMonths && categoryRoll <= 80) {
      // Completed account
      status = 'completed';
      installmentsToPay = totalMonths;
      callStatus = 'COMPLETED / PAID IN FULL';
      remarks = 'Account mukammal ada ho chuka hai. All documents returned to customer.';
    } else if (categoryRoll <= 50) {
      // Active & Up to Date (Sahih Record)
      installmentsToPay = Math.min(monthsElapsed, totalMonths - 1);
      callStatus = 'PAID ON TIME';
      remarks = 'Har mahine waqt par kist jama karwata hai. Bohat acha customer hai.';
    } else if (categoryRoll <= 70) {
      // Due Today / This Week
      installmentsToPay = Math.max(0, monthsElapsed - 1);
      callStatus = 'DUE TODAY / UPCOMING';
      remarks = 'Is mahine ki kist ki tareekh kareeb hai.';
      // Set dueDateDay to today (7) or in 2-3 days for active alerts
      if (i % 2 === 0) {
        nextDueDate = new Date(2026, 9, 7); // Today
      } else {
        nextDueDate = new Date(2026, 9, randomInt(8, 12)); // Next few days
      }
    } else if (categoryRoll <= 90) {
      // Overdue with Active Promise Date
      installmentsToPay = Math.max(0, monthsElapsed - 2);
      callStatus = 'CALLED - PAYMENT PROMISED';
      remarks = sample(PROMISE_REMARKS);
      // Promise date in next 1 to 7 days
      promiseDate = new Date(2026, 9, randomInt(8, 15));
      nextDueDate = new Date(2026, 8, dueDateDay); // Last month was due
      followUps.push({
        callStatus: 'CALLED - PAYMENT PROMISED',
        followUpDate: new Date(2026, 9, randomInt(1, 6)),
        promiseDate: promiseDate,
        remarks: remarks,
        addedBy: adminId,
        addedByName: 'System Owner',
        createdAt: new Date(2026, 9, randomInt(1, 6))
      });
    } else {
      // Critical Defaulter / Long Overdue
      installmentsToPay = Math.max(0, monthsElapsed - randomInt(3, 5));
      callStatus = sample(['SWITCHED OFF', 'NO ANSWER', 'WARNING ISSUED', 'HOME VISIT REQUIRED']);
      remarks = sample(CRITICAL_REMARKS);
      nextDueDate = new Date(2026, 6, dueDateDay); // 3 months ago
      followUps.push({
        callStatus: callStatus,
        followUpDate: new Date(2026, 8, 20),
        promiseDate: null,
        remarks: remarks,
        addedBy: adminId,
        addedByName: 'System Owner',
        createdAt: new Date(2026, 8, 20)
      });
    }

    // Generate Installment Payments
    for (let m = 1; m <= installmentsToPay; m++) {
      const pYear = saleDate.getFullYear() + Math.floor((saleDate.getMonth() + m) / 12);
      const pMonth = (saleDate.getMonth() + m) % 12;
      const paymentDate = new Date(pYear, pMonth, Math.min(dueDateDay + randomInt(-2, 3), 28));

      // Make sure payment date is not in future
      if (paymentDate <= currentDateObj) {
        const isOnline = Math.random() < 0.35;
        paymentDocs.push({
          _id: new mongoose.Types.ObjectId(),
          installmentSale: saleId,
          customer: customer._id,
          amountPaid: monthlyAmount,
          paymentMethod: isOnline ? 'online' : 'cash',
          forMonth: `${MONTH_NAMES[pMonth]} ${pYear}`,
          transactionId: isOnline ? `TRX-${randomInt(10000000, 99999999)}` : '',
          notes: `Monthly Installment (${m}/${totalMonths}) - ${isOnline ? 'Online Transfer' : 'Counter Cash'}`,
          receivedBy: adminId,
          createdAt: paymentDate,
          updatedAt: paymentDate,
          __v: 0
        });

        currentRemaining = Math.max(0, currentRemaining - monthlyAmount);
        lastPaymentDate = paymentDate;
      }
    }

    if (currentRemaining <= 0) {
      status = 'completed';
    }

    salesDocs.push({
      _id: saleId,
      customer: customer._id,
      itemName: product.name,
      itemRegNumber: regNum,
      registrationNumber: regNum,
      engineNumber: engineNum,
      chassisNumber: chassisNum,
      totalAmount,
      advancePayment,
      remainingBalance: currentRemaining,
      monthlyAmount,
      totalMonths,
      promiseMonth: plan.label,
      dueDateDay,
      cnicFront: '',
      cnicBack: '',
      guarantorName: customer.guarantorName,
      guarantorPhone: customer.guarantorPhone,
      guarantor2Name: customer.guarantor2Name,
      guarantor2Phone: customer.guarantor2Phone,
      promiseDate,
      remarks,
      callStatus,
      followUps,
      lastPaymentDate,
      nextDueDate,
      status,
      createdBy: adminId,
      createdAt: saleDate,
      updatedAt: lastPaymentDate,
      __v: 0
    });
  }

  // Insert Sales in batches
  for (let i = 0; i < salesDocs.length; i += 1000) {
    await db.collection('installmentsales').insertMany(salesDocs.slice(i, i + 1000));
  }
  console.log(`✅ 1,800 Installment Sales (Rikshaws & Bikes) Saved to Database.`);

  // Insert Payments in batches
  for (let i = 0; i < paymentDocs.length; i += 1000) {
    await db.collection('payments').insertMany(paymentDocs.slice(i, i + 1000));
  }
  console.log(`✅ ${paymentDocs.length.toLocaleString()} Installment & Advance Payments Saved to Database.`);

  // ==========================================
  // 5. GENERATE DAILY EXPENSES & DAILY CLOSINGS (365 DAYS)
  // ==========================================
  console.log('\n💵 Generating 365 Days of Daily Cash (Roznamcha) & Shop Expenses...');
  const expenseDocs = [];
  const dailyClosingDocs = [];

  let runningCashBalance = 180000;  // Initial Cash in Drawer
  let runningOnlineBalance = 250000; // Initial Bank Balance

  for (const dayDate of daysList) {
    const dateStr = formatDateStr(dayDate);
    const dayPayments = paymentDocs.filter(p => formatDateStr(new Date(p.createdAt)) === dateStr);

    let dailyCashRecovery = 0;
    let dailyOnlineRecovery = 0;
    for (const p of dayPayments) {
      if (p.paymentMethod === 'cash') {
        dailyCashRecovery += p.amountPaid;
      } else {
        dailyOnlineRecovery += p.amountPaid;
      }
    }

    // Generate 1 Cash Expense per day (Chai, Petrol, Lunch, Maintenance)
    const cashExpTitle = sample(EXPENSE_CATEGORIES);
    const cashExpAmount = randomInt(400, 2500);
    expenseDocs.push({
      _id: new mongoose.Types.ObjectId(),
      title: cashExpTitle,
      amount: cashExpAmount,
      category: "Daily Shop Operational",
      paymentMethod: "Cash",
      notes: `Shop daily expense: ${cashExpTitle}`,
      recordedBy: adminId,
      date: dayDate,
      createdAt: dayDate,
      updatedAt: dayDate,
      __v: 0
    });

    // Generate 1 Online Expense every 2-3 days (Electricity, Rent, Transport)
    let onlineExpAmount = 0;
    if (Math.random() < 0.45) {
      const onlineExpTitle = sample(["Shop Electricity Bill", "Loading & Transport Cargo", "Shop Generator Maintenance", "Internet & PTCL Bill"]);
      onlineExpAmount = randomInt(1500, 8000);
      expenseDocs.push({
        _id: new mongoose.Types.ObjectId(),
        title: onlineExpTitle,
        amount: onlineExpAmount,
        category: "Bills & Commercial",
        paymentMethod: "Online",
        notes: `Bank Transfer payment for ${onlineExpTitle}`,
        recordedBy: adminId,
        date: dayDate,
        createdAt: dayDate,
        updatedAt: dayDate,
        __v: 0
      });
    }

    const totalDailyExpenses = cashExpAmount + onlineExpAmount;

    // Running balances carryover
    const closingCash = Math.max(0, runningCashBalance + dailyCashRecovery - cashExpAmount);
    const closingOnline = Math.max(0, runningOnlineBalance + dailyOnlineRecovery - onlineExpAmount);

    dailyClosingDocs.push({
      _id: new mongoose.Types.ObjectId(),
      dateStr: dateStr,
      openingBalance: runningCashBalance,
      onlineOpeningBalance: runningOnlineBalance,
      totalCashRecovery: dailyCashRecovery,
      totalOnlineRecovery: dailyOnlineRecovery,
      totalExpenses: totalDailyExpenses,
      closingBalance: closingCash,
      onlineClosingBalance: closingOnline,
      isClosed: true,
      closedBy: adminId,
      notes: `Official Day Lock for ${dateStr}. Counter Cash and Online Accounts Balanced.`,
      createdAt: dayDate,
      updatedAt: dayDate,
      __v: 0
    });

    runningCashBalance = closingCash;
    runningOnlineBalance = closingOnline;
  }

  // Insert Expenses
  for (let i = 0; i < expenseDocs.length; i += 1000) {
    await db.collection('expenses').insertMany(expenseDocs.slice(i, i + 1000));
  }
  console.log(`✅ ${expenseDocs.length.toLocaleString()} Daily Shop Expenses Saved.`);

  // Insert Daily Closings
  await db.collection('dailyclosings').insertMany(dailyClosingDocs);
  console.log(`✅ ${dailyClosingDocs.length} Official Roznamcha Day Closings Saved.`);

  // ==========================================
  // 6. GENERATE 500 ACTIVITY AUDIT LOGS
  // ==========================================
  console.log('\n📜 Generating Activity Audit Logs...');
  const logDocs = [];
  const ACTIONS = [
    { action: 'CREATE_SALE', module: 'Installments', text: 'Nayi installment file create ki' },
    { action: 'RECORD_PAYMENT', module: 'Payments', text: 'Mahana kist wasool ki gayi' },
    { action: 'ADD_EXPENSE', module: 'Expenses', text: 'Dukan ka rozana ka kharcha record kiya' },
    { action: 'CLOSE_DAY', module: 'DailyCash', text: 'Roznamcha ka din band (lock) kiya gaya' },
    { action: 'UPDATE_PROMISE', module: 'Recovery', text: 'Recovery wada tareekh update ki gayi' }
  ];

  for (let i = 0; i < 500; i++) {
    const act = sample(ACTIONS);
    const logDate = daysList[Math.floor((i / 500) * (daysList.length - 1))];
    logDocs.push({
      _id: new mongoose.Types.ObjectId(),
      user: adminId,
      userName: 'System Owner',
      userRole: 'owner',
      action: act.action,
      module: act.module,
      details: `${act.text} (System Verification Entry #${i + 1})`,
      createdAt: logDate,
      updatedAt: logDate,
      __v: 0
    });
  }

  await db.collection('activitylogs').insertMany(logDocs);
  console.log(`✅ 500 Activity Logs Saved.`);

  // ==========================================
  // 7. SUMMARY & TOTAL STATS
  // ==========================================
  const totalCount = customerDocs.length + salesDocs.length + paymentDocs.length + expenseDocs.length + dailyClosingDocs.length + logDocs.length;
  const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n===============================================================');
  console.log('🎉 10,000+ RECORDS MASTER DATASET SEEDED SUCCESSFULLY!');
  console.log('===============================================================');
  console.log(`📊 TOTAL RECORDS SEEDED:  ${totalCount.toLocaleString()}`);
  console.log(`   - Customers:           ${customerDocs.length.toLocaleString()}`);
  console.log(`   - Installment Sales:   ${salesDocs.length.toLocaleString()} (Rikshaws & Bikes)`);
  console.log(`   - Payments Recorded:   ${paymentDocs.length.toLocaleString()} (Advance & Kist)`);
  console.log(`   - Shop Expenses:       ${expenseDocs.length.toLocaleString()}`);
  console.log(`   - Day Closings:        ${dailyClosingDocs.length.toLocaleString()} (Full 365 Days)`);
  console.log(`   - Audit Activity Logs: ${logDocs.length.toLocaleString()}`);
  console.log(`⏱️ TIME TAKEN:            ${elapsedSeconds} seconds`);
  console.log('===============================================================\n');

  process.exit(0);
}

seedHeavyDataset().catch(err => {
  console.error('❌ Seeding Failed:', err);
  process.exit(1);
});
