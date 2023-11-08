export default () => ({
  environment: process.env.NODE_ENV || 'development',
  secretKeys: {
    jwtSecret: process.env.JWT_ACCESS_SECRET,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
    passwordResetSecret: process.env.JWT_PASSWORD_RESET_SECRET,
    skipAuthSecret: process.env.SKIP_AUTH_SECRET,
  },
  database: {
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: +process.env.DATABASE_PORT || 5432,
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    autoLoadEntities: true,
  },
  encryption: {
    saltRounds: +process.env.SALT_ROUNDS || 10,
  },
});
