import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoDatabase from '../src/services/mongoDatabase';

/**
 * Health check endpoint to verify MongoDB connection
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startTime = Date.now();
  
  try {
    console.log('🏥 Health check started');
    
    // Check environment variables
    const hasMongoUri = Boolean(process.env.MONGODB_URI);
    const hasApiKey = Boolean(process.env.METASEND_API_KEY);
    
    if (!hasMongoUri) {
      return res.status(500).json({
        success: false,
        error: 'MONGODB_URI not configured',
        timestamp: new Date().toISOString(),
      });
    }

    // Test MongoDB connection with timeout
    console.log('🔄 Testing MongoDB connection...');
    const dbTest = async () => {
      try {
        // Try to ping the database
        const user = await mongoDatabase.getUserByEmail('test@health.check');
        console.log('✅ MongoDB query successful (user not found is expected)');
        return true;
      } catch (error) {
        console.error('❌ MongoDB query failed:', error);
        throw error;
      }
    };

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Health check timeout after 5 seconds')), 5000)
    );

    await Promise.race([dbTest(), timeoutPromise]);
    
    const duration = Date.now() - startTime;
    console.log(`✅ Health check passed in ${duration}ms`);

    return res.status(200).json({
      success: true,
      status: 'healthy',
      checks: {
        mongodb: 'connected',
        environment: {
          mongoUri: hasMongoUri ? 'configured' : 'missing',
          apiKey: hasApiKey ? 'configured' : 'missing',
        },
      },
      responseTime: `${duration}ms`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('❌ Health check failed:', error);
    
    return res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      checks: {
        mongodb: 'failed',
        environment: {
          mongoUri: Boolean(process.env.MONGODB_URI) ? 'configured' : 'missing',
          apiKey: Boolean(process.env.METASEND_API_KEY) ? 'configured' : 'missing',
        },
      },
      responseTime: `${duration}ms`,
      timestamp: new Date().toISOString(),
    });
  }
}
