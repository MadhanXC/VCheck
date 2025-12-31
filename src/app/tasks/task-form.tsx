'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MotoTask, motoTaskSchema } from './schema';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useFirebase } from '@/firebase';
import {
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  collection,
  writeBatch,
  getDocs,
} from 'firebase/firestore';
import { useToast } from '@/components/ui/use-toast';
import { useEffect } from 'react';
import { Link } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { DialogClose } from '@/components/ui/dialog';

interface TaskFormProps {
  task: MotoTask;
  onDialogClose: () => void;
  onCreationSuccess?: () => void;
}

export function TaskForm({ task, onDialogClose, onCreationSuccess }: TaskFormProps) {
  const { firestore, user } = useFirebase();
  const { toast } = useToast();

  const isEditMode = Boolean(task?.createdAt);

  const form = useForm<MotoTask>({
    resolver: zodResolver(motoTaskSchema),
    defaultValues: task,
    shouldUnregister: false,
  });

  useEffect(() => {
    if (task) {
      form.reset(task);
    }
  }, [task, form]);

  const onSubmit = async (data: MotoTask) => {
    if (!firestore || !user) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'User not authenticated.',
      });
      return;
    }
  
    const taskId = form.getValues('id');
  
    if (!taskId) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Task ID is missing. Please generate a link first.',
      });
      return;
    }
  
    const isIdRegenerated = isEditMode && task.id && task.id !== taskId;
  
    if (isIdRegenerated) {
      // This is an atomic "move" operation: read submissions, then batch write new task/submissions and delete old task/submissions.
      const oldTaskRef = doc(firestore, 'users', user.uid, 'motoTasks', task.id!);
      const newTaskRef = doc(firestore, 'users', user.uid, 'motoTasks', taskId);
      const oldSubmissionsRef = collection(oldTaskRef, 'submissions');
  
      try {
        const submissionsSnapshot = await getDocs(oldSubmissionsRef);
        const batch = writeBatch(firestore);
  
        // 1. Set the new document
        batch.set(newTaskRef, {
          ...data,
          id: taskId,
          createdAt: task.createdAt, // Preserve original creation date
          updatedAt: serverTimestamp(),
        });
  
        // 2. Move all submissions to the new task's subcollection
        submissionsSnapshot.forEach(submissionDoc => {
          const newSubmissionRef = doc(collection(newTaskRef, 'submissions'), submissionDoc.id);
          batch.set(newSubmissionRef, submissionDoc.data());
          batch.delete(submissionDoc.ref); // Delete old submission
        });
  
        // 3. Delete the old task document
        batch.delete(oldTaskRef);
  
        await batch.commit();
        toast({ title: 'Task Updated with New Link' });
        onDialogClose();
      } catch (err: any) {
        console.error('Error moving task:', err);
        toast({
          variant: 'destructive',
          title: 'Update failed',
          description: 'Could not move task and its submissions. ' + err.message,
        });
      }
    } else if (isEditMode) {
      // This is a standard update of the existing document
      try {
        const taskRef = doc(firestore, 'users', user.uid, 'motoTasks', task.id!);
        const { id, createdAt, ...updateData } = data; // Exclude ID and createdAt
        await updateDoc(taskRef, {
          ...updateData,
          updatedAt: serverTimestamp(),
        });
        toast({ title: 'Task Updated' });
        onDialogClose();
      } catch (err: any) {
        toast({
          variant: 'destructive',
          title: 'Save failed',
          description: err.message,
        });
      }
    } else {
      // This is a create operation for a brand new task
      try {
        const newTaskRef = doc(firestore, 'users', user.uid, 'motoTasks', taskId);
        await setDoc(newTaskRef, {
          ...data,
          id: taskId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast({ title: 'Task Created' });
        onCreationSuccess ? onCreationSuccess() : onDialogClose();
      } catch (err: any) {
        toast({
          variant: 'destructive',
          title: 'Save failed',
          description: err.message,
        });
      }
    }
  };
  
  const generateAndCopyLink = () => {
    if (!firestore || !user) return;
  
    // Always generate a new ID and link on click, for both new and edit modes.
    const newDocRef = doc(collection(firestore, 'users', user.uid, 'motoTasks'));
    const newTaskId = newDocRef.id;
    const link = `${window.location.origin}/verify/${user.uid}/${newTaskId}`;
  
    form.setValue('id', newTaskId, { shouldDirty: true });
    form.setValue('isPublic', true, { shouldDirty: true });
    form.setValue('formLink', link, { shouldDirty: true });
  
    navigator.clipboard.writeText(link);
    toast({ title: 'New link copied to clipboard' });

    // If the task was completed, reopen it.
    if (form.getValues('status') === 'Completed') {
      form.setValue('status', 'Open', { shouldDirty: true });
      toast({
        title: 'Task Reopened',
        description: 'The task status has been changed to "Open".',
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Vehicle Number */}
        <FormField
          control={form.control}
          name="vehicleNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Vehicle Number</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g., V12345" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Name */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g., John Doe" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Registration */}
        <FormField
          control={form.control}
          name="regNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Registration Number</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g., R-98765" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Description */}
        <FormField
          control={form.control}
          name="taskDescription"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Task Description</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder="Describe the task…" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Status */}
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />

        {/* Public Link */}
        <div className="space-y-2">
          <FormLabel>Public Link</FormLabel>
          <div className="flex gap-2">
            <Input
              readOnly
              value={form.watch('formLink') || 'Link not generated'}
            />
            <Button type="button" variant="secondary" onClick={generateAndCopyLink}>
              <Link className="mr-2 h-4 w-4" />
              Generate
            </Button>
          </div>
          {form.watch('isPublic') && (
            <p className="text-xs text-muted-foreground">
              Anyone with this link can view and submit verification.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4">
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="submit"
            disabled={isEditMode && !form.formState.isDirty}
          >
            {isEditMode ? 'Update Task' : 'Create Task'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
