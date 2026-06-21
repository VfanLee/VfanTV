import { z } from 'zod'

export const vodSourceImportItemSchema = z
  .object({
    name: z.string().trim().min(1, '请输入源名称'),
    baseUrl: z.string().trim().url('请输入完整 VOD API 地址'),
    enabled: z.boolean().optional(),
  })
  .strict()

export const vodSourceInputSchema = z.object({
  name: z.string().trim().min(1, '请输入数据源名称'),
  baseUrl: z.string().trim().url('请输入完整源路径'),
  enabled: z.boolean().default(false),
})

export const vodSourceSubscriptionSchema = z.array(
  z
    .object({
      name: z.string().trim().min(1, '订阅数据源名称不能为空'),
      baseUrl: z.string().trim().url('订阅数据源 URL 无效'),
      enabled: z.boolean().optional(),
    })
    .strict(),
)

export const vodSourceImportPayloadSchema = z.union([vodSourceImportItemSchema, z.array(vodSourceImportItemSchema)])

export type VodSourceImportItemInput = z.infer<typeof vodSourceImportItemSchema>
