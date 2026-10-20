import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/installment_shop';

const itemsList = [
  { name: "Samsung Galaxy A35", price: 90000 },
  { name: "Unique CD70 Motorcycle", price: 170000 },
  { name: "Haier 1.5 Ton Inverter AC", price: 185000 },
  { name: "Dawlance Glass Door Fridge", price: 135000 },
  { name: "Inverex 5KW Solar Inverter", price: 210000 },
  { name: "Orient 55 inch Smart LED TV", price: 110000 },
  { name: "Super Asia Automatic Washer", price: 75000 },
  { name: "iPhone 13 128GB", price: 220000 },
  { name: "Infinix Note 40 Pro", price: 65000 },
  { name: "Honda CG125 Special Edition", price: 285000 }
];

const customerNames = [
  "Usama", "Zain", "Zammer", "Hamza", "Bilal", "Tariq", "Shahzaib", "Farhan", "Kashif", "Asad",
  "Owais", "Mustafa", "Rashid", "Sohail", "Salman", "Imran", "Kamran", "Zubair", "Fahad", "Nabeel"
];

const areas = ["Surjani Town", "Nai Abadi Sector 6", "Orangi Town", "Gulshan-e-Iqbal", "Nazimabad", "FB Area", "North Karachi", "Korangi", "Malir", "PECHS"];
const expenseCategories = ["Rent", "Electricity Bill", "Tea & Refreshment", "Shop Maintenance", "Salary", "Stock Transport", "Internet Bill", "Generator Fuel"];

function getDatesArray() {
  const dates = [];
  let curr = new Date(2026, 6, 15); // July 15, 2026
  const end = new Date(2026, 8, 17); // Sept 17, 2026
  while (curr <= end) {
    dates.push(new Date(curr));
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

async function runMasterSeeder() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected!');

    const db = mongoose.connection.db;

    // 1. Clean Old Collections
    await Promise.all([
      db.collection('customers').deleteMany({}),
      db.collection('installmentsales').deleteMany({}),
      db.collection('payments').deleteMany({}),
      db.collection('expenses').deleteMany({}),
      db.collection('dailyclosings').deleteMany({})
    ]);
    console.log('🧹 Cleaned all 5 collections.');

    const adminUser = await db.collection('users').findOne({ username: 'admin' });
    const adminId = adminUser ? adminUser._id : new mongoose.Types.ObjectId();
    const datesArray = getDatesArray();

    // 2. Generate 8,000 Customers
    console.log('🚀 Generating 8,000 Customers...');
    const TOTAL_CUSTOMERS = 8000;
    const customerDocs = [];

    for (let i = 0; i < TOTAL_CUSTOMERS; i++) {
      const baseName = customerNames[i % customerNames.length];
      const area = areas[i % areas.length];
      const creationDate = datesArray[i % datesArray.length];

      customerDocs.push({
        _id: new mongoose.Types.ObjectId(),
        customerId: `CUST-${1001 + i}`,
        name: `${baseName} ${i + 1}`,
        phone: `03${Math.floor(100000009 + Math.random() * 900000000)}`,
        cnic: `42${Math.floor(10000000000 + Math.random() * 90000000000)}`,
        address: `House No ${i + 1} ${area}`,
        guarantorName: `Guarantor ${baseName} ${i + 1}`,
        guarantorPhone: `03${Math.floor(100000009 + Math.random() * 900000000)}`,
        createdAt: creationDate,
        updatedAt: creationDate,
        __v: 0
      });
    }

    for (let i = 0; i < customerDocs.length; i += 2000) {
      await db.collection('customers').insertMany(customerDocs.slice(i, i + 2000));
    }
    console.log('✅ 8,000 Customers Created.');

    // 3. Generate 10,000 Sales & Payments with Target Due Dates
    console.log('🚀 Generating 10,000 Sales and Payments...');
    const TOTAL_SALES = 10000;
    const salesDocs = [];
    const paymentDocs = [];

    for (let i = 0; i < TOTAL_SALES; i++) {
      const customer = customerDocs[i % customerDocs.length];
      const item = itemsList[i % itemsList.length];

      const totalAmount = item.price;
      const advancePayment = Math.floor((totalAmount * 0.20) / 1000) * 1000;
      const remainingBalance = totalAmount - advancePayment;
      const totalMonths = 12;
      const monthlyAmount = Math.round(remainingBalance / totalMonths);

      let dueDateDay = 10;
      let saleDate = new Date(2026, 6, 15);

      // DUE DATE CATEGORIZATION
      if (i < 15) {
        // 15 Clients: DUE TODAY (17th)
        saleDate = new Date(2026, 6, 17);
        dueDateDay = 17;
      } else if (i < 30) {
        // 15 Clients: DUE TOMORROW (18th)
        saleDate = new Date(2026, 6, 18);
        dueDateDay = 18;
      } else if (i < 45) {
        // 15 Clients: DUE DAY AFTER TOMORROW (19th)
        saleDate = new Date(2026, 6, 19);
        dueDateDay = 19;
      } else if (i < 1500) {
        // Group A: Defaulters 30+ Days Late
        saleDate = new Date(2026, 6, 15);
        dueDateDay = 5;
      } else if (i < 3000) {
        // Group B: Critical 16-30 Days Late
        saleDate = new Date(2026, 6, 20);
        dueDateDay = 22;
      } else if (i < 5000) {
        // Group C: Warnings 1-15 Days Late
        saleDate = new Date(2026, 6, 25);
        dueDateDay = 10;
      } else {
        // Group D: Up to date active
        saleDate = datesArray[i % datesArray.length];
        dueDateDay = [20, 25, 28][i % 3];
      }

      const saleId = new mongoose.Types.ObjectId();

      salesDocs.push({
        _id: saleId,
        customer: customer._id,
        itemName: item.name,
        totalAmount,
        advancePayment,
        remainingBalance,
        monthlyAmount,
        totalMonths,
        dueDateDay,
        status: "active",
        createdBy: adminId,
        guarantorName: customer.guarantorName,
        guarantorPhone: customer.guarantorPhone,
        createdAt: saleDate,
        updatedAt: saleDate,
        __v: 0
      });

      // Advance Payment (Cash & Online Mix)
      paymentDocs.push({
        _id: new mongoose.Types.ObjectId(),
        installmentSale: saleId,
        customer: customer._id,
        amountPaid: advancePayment,
        paymentMethod: i % 3 === 0 ? "online" : "cash",
        receivedBy: adminId,
        notes: "Advance Payment at Purchase",
        createdAt: saleDate,
        updatedAt: saleDate,
        __v: 0
      });

      // Installment Payments
      if (i >= 3000 && i < 5000) {
        const augPaymentDate = new Date(2026, 7, 10);
        paymentDocs.push({
          _id: new mongoose.Types.ObjectId(),
          installmentSale: saleId,
          customer: customer._id,
          amountPaid: monthlyAmount,
          paymentMethod: i % 2 === 0 ? "cash" : "online",
          receivedBy: adminId,
          notes: "Monthly Installment for Aug",
          createdAt: augPaymentDate,
          updatedAt: augPaymentDate,
          __v: 0
        });
      } else if (i >= 5000) {
        const augPaymentDate = new Date(2026, 7, dueDateDay);
        if (augPaymentDate < new Date(2026, 8, 17)) {
          paymentDocs.push({
            _id: new mongoose.Types.ObjectId(),
            installmentSale: saleId,
            customer: customer._id,
            amountPaid: monthlyAmount,
            paymentMethod: i % 2 === 0 ? "cash" : "online",
            receivedBy: adminId,
            notes: "Monthly Installment Paid",
            createdAt: augPaymentDate,
            updatedAt: augPaymentDate,
            __v: 0
          });
        }
      }
    }

    for (let i = 0; i < salesDocs.length; i += 2000) {
      await db.collection('installmentsales').insertMany(salesDocs.slice(i, i + 2000));
    }
    console.log('✅ 10,000 Sales Created.');

    for (let i = 0; i < paymentDocs.length; i += 2000) {
      await db.collection('payments').insertMany(paymentDocs.slice(i, i + 2000));
    }
    console.log('✅ Payments Created.');

    // 4. Generate Expenses (Cash + Online) & Daily Closings
    console.log('🚀 Generating Daily Expenses (Cash & Online) & Closings...');
    const expenseDocs = [];
    const dailyClosingDocs = [];
    let runningBalance = 150000;

    for (const currentDate of datesArray) {
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      // Expense 1: Cash Expense
      const cashExpenseAmt = 1200 + Math.floor(Math.random() * 2000);
      const cashCategory = expenseCategories[Math.floor(Math.random() * expenseCategories.length)];
      expenseDocs.push({
        _id: new mongoose.Types.ObjectId(),
        title: cashCategory,
        amount: cashExpenseAmt,
        category: "Operational",
        paymentMethod: "cash",
        notes: "Daily shop cash operational expense",
        recordedBy: adminId,
        date: currentDate,
        createdAt: currentDate,
        updatedAt: currentDate,
        __v: 0
      });

      // Expense 2: Online Expense
      const onlineExpenseAmt = 1500 + Math.floor(Math.random() * 2500);
      const onlineCategory = expenseCategories[Math.floor(Math.random() * expenseCategories.length)];
      expenseDocs.push({
        _id: new mongoose.Types.ObjectId(),
        title: onlineCategory,
        amount: onlineExpenseAmt,
        category: "Bills & Maintenance",
        paymentMethod: "online",
        notes: "Online bank transfer shop expense",
        recordedBy: adminId,
        date: currentDate,
        createdAt: currentDate,
        updatedAt: currentDate,
        __v: 0
      });

      const totalDailyExpenses = cashExpenseAmt + onlineExpenseAmt;

      const todaysPayments = paymentDocs.filter(p => 
        new Date(p.createdAt).toDateString() === currentDate.toDateString()
      );

      const totalAdvance = todaysPayments
        .filter(p => p.notes.includes("Advance"))
        .reduce((sum, p) => sum + p.amountPaid, 0);

      const totalInstallments = todaysPayments
        .filter(p => !p.notes.includes("Advance"))
        .reduce((sum, p) => sum + p.amountPaid, 0);

      const closingBal = runningBalance + totalAdvance + totalInstallments - totalDailyExpenses;

      dailyClosingDocs.push({
        _id: new mongoose.Types.ObjectId(),
        date: currentDate,
        dateStr: dateStr,
        totalOpeningBalance: runningBalance,
        totalSalesAdvance: totalAdvance,
        totalInstallmentsCollected: totalInstallments,
        totalExpenses: totalDailyExpenses,
        closingBalance: closingBal,
        createdAt: currentDate,
        updatedAt: currentDate,
        __v: 0
      });

      runningBalance = closingBal;
    }

    await db.collection('expenses').insertMany(expenseDocs);
    await db.collection('dailyclosings').insertMany(dailyClosingDocs);

    console.log('✅ Expenses (Cash & Online) and Daily Closings Generated.');
    console.log('\n==================================================');
    console.log('🎉 10,000 RECORDS MASTER DATASET SEEDED SUCCESSFULLY!');
    console.log('==================================================\n');
    process.exit(0);

  } catch (error) {
    console.error('❌ Seeding Failed:', error);
    process.exit(1);
  }
}

runMasterSeeder();