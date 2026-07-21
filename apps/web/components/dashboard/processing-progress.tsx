"use client";

import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import type { ProcessingJob } from "@/store/ffmpeg-store";

interface ProcessingProgressProps {
  job: ProcessingJob;
  onReset: () => void;
}

export function ProcessingProgress({ job, onReset }: ProcessingProgressProps) {
  const getStatusIcon = () => {
    switch (job.status) {
      case "processing":
        return <Loader2 className="w-5 h-5 animate-spin text-primary" />;
      case "completed":
        return <CheckCircle className="h-5 w-5 text-primary" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return null;
    }
  };

  const getStatusText = () => {
    switch (job.status) {
      case "processing":
        return "Processing...";
      case "completed":
        return "Completed!";
      case "failed":
        return "Failed";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {getStatusIcon()}
        <span className="text-sm font-medium">{getStatusText()}</span>
      </div>

      <Progress value={job.progress} className="w-full" />

      <p className="text-xs text-muted-foreground">
        {Math.round(job.progress)}% complete
      </p>

      {job.status === "completed" && job.outputPath && (
        <div className="rounded-md bg-primary/10 p-3">
          <p className="text-sm text-primary">
            Output saved to: {job.outputPath}
          </p>
        </div>
      )}

      {job.status === "failed" && job.error && (
        <div className="rounded-md bg-destructive/10 p-3">
          <p className="text-sm text-destructive">Error: {job.error}</p>
        </div>
      )}

      {(job.status === "completed" || job.status === "failed") && (
        <Button onClick={onReset} className="w-full">
          Process Another File
        </Button>
      )}
    </div>
  );
}
