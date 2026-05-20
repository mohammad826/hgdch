import admin from 'firebase-admin';

async function test() {
  try {
    admin.initializeApp();
    const db = admin.firestore();
    await db.collection('test').doc('test').set({ test: true });
    console.log('SUCCESS');
  } catch (err) {
    console.error('ERROR', err);
  }
}
test();
