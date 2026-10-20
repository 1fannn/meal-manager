async function main() {
  if (process.env.DATABASE_URL || process.env.NODE_ENV === 'production') {
    await require('./server').start();
  } else {
    require('./personal').start();
  }
}
main().catch(error => {
  console.error('Startup failed:', error.code || error.message);
  process.exit(1);
});
