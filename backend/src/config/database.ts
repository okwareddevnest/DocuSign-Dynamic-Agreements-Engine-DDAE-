import { Sequelize } from 'sequelize';
import { logger } from '../utils/logger';

const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  logging: (msg) => logger.debug(msg),
});

export async function setupDatabase() {
  try {
    await sequelize.authenticate();
    logger.info('Database connection established successfully');
    
    // Sync models with database
    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    logger.info('Database models synchronized');
    
    return sequelize;
  } catch (error) {
    logger.error('Unable to connect to the database:', error);
    throw error;
  }
}

export { sequelize }; 