import mysql from 'mysql2/promise'

let pool: mysql.Pool | null = null

export function getMySQLPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: parseInt(process.env.MYSQL_PORT || '13306', 10),
      user: process.env.MYSQL_USER || 'hotelin',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'hotelin',
      connectionLimit: 5,
      enableKeepAlive: true,
      waitForConnections: true,
    })
  }
  return pool
}

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const pool = getMySQLPool()
  const [rows] = await pool.execute(sql, params)
  return rows as T[]
}
