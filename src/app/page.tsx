
'use client';

import { VCheckLogo } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal
} from '@/components/ui/dropdown-menu';
import { useFirebase, useUser, useAuth } from '@/firebase';
import { LayoutDashboard, PlusCircle, FileDown, DownloadCloud, LogOut, User as UserIcon, ListTodo, Activity, CheckCircle2, AlertCircle, MoreVertical } from 'lucide-react';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { DataTable, DataTableRef } from './tasks/data-table';
import { getColumns } from './tasks/columns';
import { collection, doc, writeBatch, getDocs, getDoc } from 'firebase/firestore';
import { getStorage, ref as storageRef, deleteObject } from 'firebase/storage';
import { useCollection, useMemoFirebase } from '@/firebase';
import type { MotoTask } from './tasks/schema';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import type { VerificationSubmission } from './verify/[userId]/[taskId]/schema';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TaskForm } from './tasks/task-form';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';


export default function DashboardPage() {
  const { firestore } = useFirebase();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const isMobile = useIsMobile();

  const dataTableRef = useRef<DataTableRef>(null);
  const { toast } = useToast();

  const [isNewTaskDialogOpen, setIsNewTaskDialogOpen] = useState(false);
  const [newTaskPlaceholder, setNewTaskPlaceholder] = useState<MotoTask | null>(null);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/auth');
    }
  }, [isUserLoading, user, router]);

  const tasksQuery = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return collection(firestore, 'users', user.uid, 'motoTasks');
  }, [firestore, user]);

  const {
    data: tasks,
    isLoading: isTasksLoading,
    error: tasksError,
  } = useCollection<MotoTask>(tasksQuery);


  const handleNewTask = useCallback(() => {
    if (!firestore || !user) return;
    if (!newTaskPlaceholder) {
      const newTaskRef = doc(collection(firestore, 'users', user.uid, 'motoTasks'));
      setNewTaskPlaceholder({
        id: newTaskRef.id,
        vehicleNumber: '',
        name: '',
        regNumber: '',
        taskDescription: '',
        status: 'Open',
        isPublic: false,
        formLink: '',
      } as MotoTask);
    }
    setIsNewTaskDialogOpen(true);
  }, [firestore, user, newTaskPlaceholder]);
  
  const deleteTaskAndSubmissions = useCallback(async (task: MotoTask) => {
    if (!firestore || !user || !task.id) return;
  
    toast({
      title: 'Deleting Task...',
      description: `Preparing to delete task for ${task.vehicleNumber}.`,
    });
  
    try {
      const storage = getStorage();
      const taskRef = doc(firestore, 'users', user.uid, 'motoTasks', task.id);
      const submissionsRef = collection(taskRef, 'submissions');
      const submissionsSnap = await getDocs(submissionsRef);
      const batch = writeBatch(firestore);
  
      for (const submissionDoc of submissionsSnap.docs) {
        const submissionData = submissionDoc.data() as VerificationSubmission;
        if (submissionData.photoUrls && submissionData.photoUrls.length > 0) {
          for (const url of submissionData.photoUrls) {
            try {
              const imageRef = storageRef(storage, url);
              await deleteObject(imageRef);
            } catch (storageError: any) {
              if (storageError.code !== 'storage/object-not-found') {
                console.error(`Failed to delete file from storage: ${url}`, storageError);
              }
            }
          }
        }
        batch.delete(submissionDoc.ref);
      }
  
      batch.delete(taskRef);
      await batch.commit();
  
      toast({
        title: 'Task Successfully Deleted',
        description: `Task and all its submissions for ${task.vehicleNumber} have been removed.`,
      });
    } catch (error) {
      console.error("Error deleting task and its subcollections: ", error);
      toast({
        variant: "destructive",
        title: "Error Deleting Task",
        description: "There was a problem removing the task and its data.",
      });
    }
  }, [firestore, user, toast]);

  const handleCopyTaskId = useCallback((task: MotoTask) => {
    if (!task.id) return;
    navigator.clipboard.writeText(task.id);
    toast({
      title: 'Task ID Copied',
      description: 'The task ID has been copied to your clipboard.',
    });
  }, [toast]);

  const handleDownloadTask = useCallback(async (task: MotoTask) => {
    if (!firestore || !user || !task.id) return;

    toast({
      title: 'Preparing Download...',
      description: `Gathering data for task ${task.vehicleNumber}.`,
    });

    try {
      const zip = new JSZip();

      // 1. Fetch submissions
      const submissionsRef = collection(firestore, 'users', user.uid, 'motoTasks', task.id, 'submissions');
      const submissionsSnap = await getDocs(submissionsRef);
      const submissions = submissionsSnap.docs.map(doc => ({...doc.data(), id: doc.id} as VerificationSubmission & {id: string}));

      // 2. Prepare data for Excel file
      const wb = XLSX.utils.book_new();

      // Task Details Sheet
      const taskDetailsForSheet = [{
        'Task ID': task.id,
        'Vehicle Number': task.vehicleNumber,
        'Name': task.name,
        'Registration Number': task.regNumber,
        'Description': task.taskDescription,
        'Status': task.status,
        'Public Link': task.formLink,
        'Created At': task.createdAt ? format(new Date((task.createdAt as any).seconds * 1000), 'yyyy-MM-dd HH:mm:ss') : '',
        'Updated At': task.updatedAt ? format(new Date((task.updatedAt as any).seconds * 1000), 'yyyy-MM-dd HH:mm:ss') : '',
      }];
      const wsTask = XLSX.utils.json_to_sheet(taskDetailsForSheet);
      XLSX.utils.book_append_sheet(wb, wsTask, 'Task Details');

      // Submissions Sheet
      if (submissions.length > 0) {
        const submissionsForSheet = submissions.map(sub => ({
          'Submission ID': sub.id,
          'Verifier Name': sub.verifierName,
          'Notes': sub.notes,
          'Submitted At': sub.createdAt ? format(new Date((sub.createdAt as any).seconds * 1000), 'yyyy-MM-dd HH:mm:ss') : '',
          'Photo URLs': (sub.photoUrls || []).join(', '),
        }));
        const wsSubmissions = XLSX.utils.json_to_sheet(submissionsForSheet);
        XLSX.utils.book_append_sheet(wb, wsSubmissions, 'Submissions');
      }

      // Generate Excel file buffer
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      zip.file('task_data.xlsx', excelBuffer);


      // 3. Fetch photos and add to zip
      const photoPromises = submissions.flatMap((sub, subIndex) => 
        (sub.photoUrls || []).map(async (url, photoIndex) => {
          try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
            const blob = await response.blob();
            const fileName = `submission_${sub.id}_photo_${photoIndex + 1}.jpg`;
            zip.file(`photos/${fileName}`, blob);
          } catch (e) {
            console.error(`Could not download image ${url}:`, e);
            zip.file(`photos/FAILED_TO_DOWNLOAD_submission_${sub.id}_photo_${photoIndex + 1}.txt`, `Failed to download: ${url}`);
          }
        })
      );
      
      await Promise.all(photoPromises);

      // 4. Generate and download zip
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = `mototask_${task.id}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      toast({
        title: 'Download Ready',
        description: 'Your task archive has been downloaded.',
      });

    } catch (error) {
      console.error("Error creating task archive: ", error);
      toast({
        variant: "destructive",
        title: "Download Failed",
        description: "There was a problem creating the task archive.",
      });
    }

  }, [firestore, user, toast]);

  const handleGenerateReport = useCallback((period: 'daily' | 'weekly' | 'monthly' | 'yearly', formatType: 'excel' | 'pdf') => {
    if (!tasks) {
      toast({
        variant: 'destructive',
        title: 'No Data',
        description: 'There are no tasks to generate a report from.',
      });
      return;
    }
  
    toast({
      title: 'Generating Report...',
      description: `Creating your ${period} report as a ${formatType.toUpperCase()} file.`,
    });
  
    let startDate: Date, endDate: Date = new Date();
    const now = new Date();
  
    switch (period) {
      case 'daily':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        endDate = new Date(now.setHours(23, 59, 59, 999));
        break;
      case 'weekly':
        const firstDay = now.getDate() - now.getDay();
        startDate = new Date(now.setDate(firstDay));
        startDate.setHours(0,0,0,0);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23,59,59,999);
        break;
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        endDate.setHours(23,59,59,999);
        break;
      case 'yearly':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31);
        endDate.setHours(23,59,59,999);
        break;
    }
  
    const filteredTasks = tasks.filter(task => {
      if (!task.createdAt || !(task.createdAt as any).seconds) return false;
      const createdAtDate = new Date((task.createdAt as any).seconds * 1000);
      return createdAtDate >= startDate && createdAtDate <= endDate;
    });
  
    if (filteredTasks.length === 0) {
      toast({
        title: 'No Tasks Found',
        description: `No tasks were created in the selected period: ${format(startDate, 'PP')} - ${format(endDate, 'PP')}`,
      });
      return;
    }
  
    const reportTitle = `${period.charAt(0).toUpperCase() + period.slice(1)} Task Report`;
    const reportFileName = `${period}_report_${format(now, 'yyyy-MM-dd')}`;
    const dateRange = `${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`;
  
    const dataForSheet = (tasks: MotoTask[]) =>
      tasks.map(task => ({
        'Task ID': task.id,
        'Vehicle Number': task.vehicleNumber,
        'Name': task.name,
        'Registration Number': task.regNumber,
        'Description': task.taskDescription,
        'Status': task.status,
        'Created At': task.createdAt ? format(new Date((task.createdAt as any).seconds * 1000), 'yyyy-MM-dd HH:mm:ss') : '',
      }));
  
    if (formatType === 'excel') {
      const wb = XLSX.utils.book_new();
  
      // Summary Sheet
      const summarySheet = [
        { 'Report Title': reportTitle },
        { 'Date Range': dateRange },
        { 'Total Tasks': filteredTasks.length },
        { 'Open': filteredTasks.filter(t => t.status === 'Open').length },
        { 'In Progress': filteredTasks.filter(t => t.status === 'In Progress').length },
        { 'Completed': filteredTasks.filter(t => t.status === 'Completed').length },
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summarySheet, { skipHeader: true });
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
      
      // All Tasks Sheet
      const wsAll = XLSX.utils.json_to_sheet(dataForSheet(filteredTasks));
      XLSX.utils.book_append_sheet(wb, wsAll, 'All Tasks');
  
      // Open Tasks
      const openTasks = filteredTasks.filter(t => t.status === 'Open');
      if(openTasks.length > 0) {
        const wsOpen = XLSX.utils.json_to_sheet(dataForSheet(openTasks));
        XLSX.utils.book_append_sheet(wb, wsOpen, 'Open Tasks');
      }
  
      // Completed Tasks
      const completedTasks = filteredTasks.filter(t => t.status === 'Completed');
      if(completedTasks.length > 0){
        const wsCompleted = XLSX.utils.json_to_sheet(dataForSheet(completedTasks));
        XLSX.utils.book_append_sheet(wb, wsCompleted, 'Completed Tasks');
      }
  
      XLSX.writeFile(wb, `${reportFileName}.xlsx`);
    } else if (formatType === 'pdf') {
      const doc = new jsPDF();
      
      doc.setFontSize(18);
      doc.text(reportTitle, 14, 22);
      doc.setFontSize(11);
      doc.text(`Date Range: ${dateRange}`, 14, 30);
  
      const tableData = dataForSheet(filteredTasks);
      const head = [['Vehicle No', 'Name', 'Reg No', 'Status', 'Created At']];
      const body = tableData.map(t => [t['Vehicle Number'], t['Name'], t['Registration Number'], t['Status'], t['Created At']]);
  
      (doc as any).autoTable({
        startY: 35,
        head: head,
        body: body,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] },
      });
  
      doc.save(`${reportFileName}.pdf`);
    }
  
    toast({
      title: 'Report Downloaded',
      description: `Your ${period} report has been successfully generated.`,
    });
  
  }, [tasks, toast]);

  const handleDownloadAllTasksArchive = useCallback(async () => {
    if (!firestore || !user || !tasks || tasks.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Tasks',
        description: 'There are no tasks available to download.',
      });
      return;
    }

    toast({
      title: 'Starting Full Archive...',
      description: 'This may take a while. Please do not close this window.',
    });

    try {
      const zip = new JSZip();
      
      // Iterate over each task
      for (const task of tasks) {
        if (!task.id) continue;
        
        const taskFolder = zip.folder(`task_${task.id}`);
        if (!taskFolder) continue;

        // Fetch submissions for the current task
        const submissionsRef = collection(firestore, 'users', user.uid, 'motoTasks', task.id, 'submissions');
        const submissionsSnap = await getDocs(submissionsRef);
        
        const submissions = submissionsSnap.docs.map(doc => ({ ...doc.data() } as VerificationSubmission & { id: string }));

        const photoPromises = submissions.flatMap(sub => 
          (sub.photoUrls || []).map(async (url, photoIndex) => {
            try {
              const response = await fetch(url);
              if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
              const blob = await response.blob();
              // Extract original filename from URL if possible, otherwise generate one
              const urlPath = new URL(url).pathname;
              const originalFileName = decodeURIComponent(urlPath.split('/').pop() || '');
              const fileName = originalFileName || `photo_${photoIndex + 1}.jpg`;
              taskFolder.file(`photos/${fileName}`, blob);
            } catch (e) {
              console.error(`Could not download image ${url}:`, e);
              taskFolder.file(`photos/FAILED_TO_DOWNLOAD_for_sub_${sub.id}.txt`, `Failed to download: ${url}`);
            }
          })
        );
        
        // Wait for all photos for the current task to be processed before moving to the next
        await Promise.all(photoPromises);
      }

      // Generate and download the final zip file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = `all_tasks_archive.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      toast({
        title: 'Full Archive Ready',
        description: 'All task images have been downloaded.',
      });

    } catch (error) {
      console.error("Error creating full archive: ", error);
      toast({
        variant: "destructive",
        title: "Archive Failed",
        description: "There was a problem creating the full archive.",
      });
    }
  }, [firestore, user, tasks, toast]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.push('/auth');
      toast({
        title: 'Signed Out',
        description: 'You have been successfully signed out.',
      });
    } catch (error) {
      console.error('Sign out error:', error);
      toast({
        variant: 'destructive',
        title: 'Sign Out Failed',
        description: 'There was an issue signing you out.',
      });
    }
  };
  
  const columns = useMemo(() => getColumns(), []);

  const stats = useMemo(() => {
    if (!tasks) {
      return { total: 0, open: 0, inProgress: 0, completed: 0 };
    }
    return {
      total: tasks.length,
      open: tasks.filter(t => t.status === 'Open').length,
      inProgress: tasks.filter(t => t.status === 'In Progress').length,
      completed: tasks.filter(t => t.status === 'Completed').length,
    };
  }, [tasks]);
  
  const DesktopHeaderActions = () => (
    <>
       <Button variant="outline" onClick={handleDownloadAllTasksArchive} disabled={!tasks || tasks.length === 0}>
        <DownloadCloud className="mr-2 h-4 w-4" />
        Download All
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <FileDown className="mr-2 h-4 w-4" />
            Reports
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Generate Report</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {(['daily', 'weekly', 'monthly', 'yearly'] as const).map(period => (
            <DropdownMenuSub key={period}>
              <DropdownMenuSubTrigger>{period.charAt(0).toUpperCase() + period.slice(1)}</DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => handleGenerateReport(period, 'excel')}>Excel</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleGenerateReport(period, 'pdf')}>PDF</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  if (isUserLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-12 w-12 rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b bg-background/80 px-4 backdrop-blur-sm md:px-6">
        <div className="flex items-center gap-2 md:gap-4">
          <VCheckLogo className="h-8 w-8 text-primary" />
          <h1 className="text-xl font-bold font-headline">V-Check</h1>
        </div>
        <div className="flex flex-1 items-center justify-end gap-2">
           {isMobile ? (
             <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Reports</DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent>
                       {(['daily', 'weekly', 'monthly', 'yearly'] as const).map(period => (
                          <DropdownMenuSub key={period}>
                            <DropdownMenuSubTrigger>{period.charAt(0).toUpperCase() + period.slice(1)}</DropdownMenuSubTrigger>
                            <DropdownMenuPortal>
                              <DropdownMenuSubContent>
                                <DropdownMenuItem onClick={() => handleGenerateReport(period, 'excel')}>Excel</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleGenerateReport(period, 'pdf')}>PDF</DropdownMenuItem>
                              </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                          </DropdownMenuSub>
                        ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
                <DropdownMenuItem onClick={handleDownloadAllTasksArchive} disabled={!tasks || tasks.length === 0}>
                  Download All
                </DropdownMenuItem>
              </DropdownMenuContent>
             </DropdownMenu>
           ) : (
            <DesktopHeaderActions />
           )}
           <Button onClick={handleNewTask} size={isMobile ? 'icon' : 'default'}>
              <PlusCircle className={cn(!isMobile && 'mr-2')}/>
              <span className="hidden md:inline">New Task</span>
            </Button>
           <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <UserIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main className="flex-1 p-4 md:p-6 lg:p-8 xl:p-10 2xl:p-12">
        <div className="mb-4">
            <h2 className="text-2xl font-bold font-headline">
                Welcome, {user.displayName || 'User'}!
            </h2>
        </div>
        <div className="space-y-4">
           {isTasksLoading ? (
             <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
           ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
                <ListTodo className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Open</CardTitle>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.open}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">In Progress</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.inProgress}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completed</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.completed}</div>
              </CardContent>
            </Card>
          </div>
           )}

          {isTasksLoading && (
            <div className="space-y-2 pt-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {tasksError && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive-foreground">
              <p>Error loading tasks: {tasksError.message}</p>
            </div>
          )}
          {!isTasksLoading && tasks && (
            <DataTable
              ref={dataTableRef}
              columns={columns}
              data={tasks}
              onDelete={deleteTaskAndSubmissions}
              onCopyId={handleCopyTaskId}
              onDownload={handleDownloadTask}
            />
          )}
        </div>
      </main>

      {/* New Task Dialog */}
      <Dialog open={isNewTaskDialogOpen} onOpenChange={setIsNewTaskDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Create New Task
            </DialogTitle>
          </DialogHeader>
          {newTaskPlaceholder && (
            <TaskForm 
              task={newTaskPlaceholder} 
              onDialogClose={() => setIsNewTaskDialogOpen(false)} 
              onCreationSuccess={() => {
                setIsNewTaskDialogOpen(false);
                setNewTaskPlaceholder(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
