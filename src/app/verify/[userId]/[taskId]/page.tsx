'use client';

import React, { useEffect, useState } from 'react';
import { getDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { FirebaseClientProvider, useFirebase } from '@/firebase';

import type { MotoTask } from '@/app/tasks/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, CheckCircle, Hourglass, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SubmissionForm } from './submission-form';
import { useToast } from '@/components/ui/use-toast';
import { initiateAnonymousSignIn, useUser } from '@/firebase';

interface VerificationPageProps {
  params: Promise<{
    userId: string;
    taskId: string;
  }>;
}

function VerificationForm({ userId, taskId }: { userId: string; taskId: string }) {
  const { toast } = useToast();
  const [task, setTask] = useState<MotoTask | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { firestore, auth } = useFirebase();
  const { user, isUserLoading } = useUser();

  useEffect(() => {
    // This page is public, but requires anonymous auth for storage uploads.
    // So we sign the user in here.
     if (!isUserLoading && !user) {
      initiateAnonymousSignIn(auth);
    }
  }, [isUserLoading, user, auth]);


  useEffect(() => {
    if (!firestore) return;

    const fetchTask = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const taskRef = doc(firestore, 'users', userId, 'motoTasks', taskId);
        const taskSnap = await getDoc(taskRef);

        if (taskSnap.exists()) {
           const taskData = { ...taskSnap.data(), id: taskSnap.id } as MotoTask;
           if (taskData.isPublic) {
            setTask(taskData);
           } else {
            setError(new Error("This task is not public."));
            setTask(null); // Task is not public
           }
        } else {
           setError(new Error("This task could not be found."));
           setTask(null); // Task not found
        }
      } catch (err: any) {
        console.error("Error fetching task:", err);
        setError(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTask();
  }, [firestore, userId, taskId]);


  const handleSubmissionSuccess = async () => {
    if (!firestore) return;
    try {
      const taskRef = doc(firestore, 'users', userId, 'motoTasks', taskId);
      await updateDoc(taskRef, {
        status: 'Completed',
        updatedAt: serverTimestamp(),
      });
      // Re-fetch task to show the completed status
      const updatedSnap = await getDoc(taskRef);
      if (updatedSnap.exists()) {
        setTask({ ...updatedSnap.data(), id: updatedSnap.id } as MotoTask);
      }
      toast({
        title: "Submission Received",
        description: "The task has been updated to 'Completed'.",
      })
    } catch(e) {
       console.error("Error updating task status: ", e);
       toast({
        variant: "destructive",
        title: "Error",
        description: "Could not update task status after submission.",
      })
    }
  }

  if (isLoading) {
    return (
      <Card className="w-full max-w-lg">
        <CardHeader>
          <Skeleton className="h-8 w-3/4" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full max-w-lg border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <XCircle />
            Error Loading Task
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p>There was an error loading this verification task.</p>
          <p className="mt-2 text-xs text-muted-foreground">{error.message}</p>
        </CardContent>
      </Card>
    );
  }
  
  if (!task) { // This case should be covered by the error state now
    return (
      <Card className="w-full max-w-lg border-yellow-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-yellow-600">
            <AlertTriangle />
            Invalid Link
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p>This verification link is invalid. Please contact the sender for a valid link.</p>
        </CardContent>
      </Card>
    );
  }

  if (task.status === 'Completed') {
    return (
       <Card className="w-full max-w-lg border-primary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <CheckCircle />
            Verification Completed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p>This task has been marked as completed.</p>
           <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
            <div className="font-semibold">Vehicle No:</div>
            <div className="col-span-2">{task.vehicleNumber}</div>
            
            <div className="font-semibold">Name:</div>
            <div className="col-span-2">{task.name}</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className='flex items-center justify-between'>
          Vehicle Verification
          <Badge variant={task.status === 'Open' ? 'outline' : 'secondary'}>
            {task.status === 'In Progress' ? <Hourglass className="mr-1 h-3 w-3 animate-spin"/> : null}
            {task.status}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-3 gap-y-2 gap-x-4 text-sm">
            <div className="font-semibold text-muted-foreground">Vehicle Number</div>
            <div className="col-span-2 font-mono">{task.vehicleNumber}</div>
            
            <div className="font-semibold text-muted-foreground">Name</div>
            <div className="col-span-2">{task.name}</div>
            
            <div className="font-semibold text-muted-foreground">Registration No.</div>
            <div className="col-span-2 font-mono">{task.regNumber}</div>

            <div className="font-semibold text-muted-foreground col-span-3 mt-2 border-t pt-2">Task</div>
            <div className="col-span-3 whitespace-pre-wrap">{task.taskDescription}</div>
        </div>
        <SubmissionForm userId={userId} taskId={taskId} onSuccess={handleSubmissionSuccess} />
      </CardContent>
    </Card>
  );
}


export default function VerificationPage({ params: paramsProp }: VerificationPageProps) {
    const params = React.use(paramsProp);
    return (
        <main className="flex min-h-screen flex-col items-center justify-center bg-muted p-4">
            <FirebaseClientProvider>
                <VerificationForm userId={params.userId} taskId={params.taskId} />
            </FirebaseClientProvider>
        </main>
    )
}
