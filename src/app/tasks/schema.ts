import { z } from 'zod';

export const motoTaskSchema = z.object({
  id: z.string().optional(), // ✅ FIX
  vehicleNumber: z.string().min(1, 'Vehicle number is required'),
  name: z.string().min(1, 'Name is required'),
  regNumber: z.string().min(1, 'Registration number is required'),
  taskDescription: z.string().optional(), // ✅ FIX
  status: z.enum(['Open', 'In Progress', 'Completed']),
  isPublic: z.boolean().optional(),
  formLink: z.string().optional(),
  createdAt: z.any().optional(), // ✅ FIX
  updatedAt: z.any().optional(), // ✅ FIX
});

export type MotoTask = z.infer<typeof motoTaskSchema>;
