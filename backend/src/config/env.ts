import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  DATABASE_URL: z.string().optional(),
  POSTGRES_HOST: z.string().default('db-aquarius'),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_DB: z.string().default('aquarius'),
  POSTGRES_USER: z.string().default('aquarius'),
  POSTGRES_PASSWORD: z.string().default('aquarius'),
  MINIO_ENDPOINT: z.string().default('minio-aquarius'),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_USE_SSL: z.coerce.boolean().default(false),
  MINIO_ACCESS_KEY: z.string().default('minioadmin'),
  MINIO_SECRET_KEY: z.string().default('minioadmin'),
  MINIO_BUCKET_PUBLIC: z.string().default('publicdata'),
  MINIO_BUCKET_PRIVATE: z.string().default('privatedata')
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('環境変数の読み込みに失敗しました', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

const values = parsed.data

export const env = {
  ...values,
  postgres: values.DATABASE_URL
    ? { connectionString: values.DATABASE_URL }
    : {
        host: values.POSTGRES_HOST,
        port: values.POSTGRES_PORT,
        database: values.POSTGRES_DB,
        user: values.POSTGRES_USER,
        password: values.POSTGRES_PASSWORD
      },
  minio: {
    endPoint: values.MINIO_ENDPOINT,
    port: values.MINIO_PORT,
    useSSL: values.MINIO_USE_SSL,
    accessKey: values.MINIO_ACCESS_KEY,
    secretKey: values.MINIO_SECRET_KEY,
    bucketPublic: values.MINIO_BUCKET_PUBLIC,
    bucketPrivate: values.MINIO_BUCKET_PRIVATE
  }
} as const
