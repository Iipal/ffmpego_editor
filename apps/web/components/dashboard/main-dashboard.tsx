"use client";

import { useEffect, useCallback, useRef } from "react";
import { useFFmpegState, useFFmpegStore } from "@/store/ffmpeg-store";
import type { ProcessingJob } from "@/store/ffmpeg-store";
import { FileDropzone } from "./file-dropzone";
import { ParameterSelector } from "./parameter-selector";
import { ProcessingProgress } from "./processing-progress";
import { Button } from "@/components/ui/button";

export function MainDashboard() {
  const store = useFFmpegState();
  const ffmpegStore = useFFmpegStore();

  const eventSourceRef = useRef<EventSource | null>(null);

  const handleFileSelect = useCallback(
    (file: File | null) => {
      ffmpegStore.setState((prev) => ({
        ...prev,
        selectedFile: file,
        fileUrl: file ? URL.createObjectURL(file) : null,
      }));
    },
    [ffmpegStore],
  );

  const handleParamsChange = useCallback(
    (params: any) => {
      ffmpegStore.setState((prev) => ({ ...prev, parameters: params }));
    },
    [ffmpegStore],
  );

  // SSE listener for real-time progress updates
  useEffect(() => {
    if (store.currentJob?.status === "processing") {
      const eventSource = new EventSource(`/api/jobs/${store.currentJob.id}`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "progress") {
          ffmpegStore.setState((prev) => ({
            ...prev,
            currentJob: prev.currentJob
              ? { ...prev.currentJob, progress: data.progress }
              : null,
            isProcessing: true,
          }));
        } else if (data.type === "complete") {
          eventSource.close();
          eventSourceRef.current = null;
          ffmpegStore.setState((prev) => ({
            ...prev,
            isProcessing: false,
            currentJob: data.success
              ? {
                  ...prev.currentJob!,
                  status: "completed" as const,
                  progress: 100,
                  outputPath: data.outputPath,
                }
              : {
                  ...prev.currentJob!,
                  status: "failed" as const,
                  progress: 100,
                  error: data.error,
                },
          }));
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        eventSourceRef.current = null;
        ffmpegStore.setState((prev) => ({
          ...prev,
          isProcessing: false,
          currentJob: prev.currentJob
            ? { ...prev.currentJob, status: "failed" as const }
            : null,
        }));
      };

      return () => eventSource.close();
    }
  }, [store.currentJob?.status, store.currentJob?.id, ffmpegStore]);

  const handleSubmit = useCallback(async () => {
    if (!store.selectedFile || !store.fileUrl) return;

    const selectedFile = store.selectedFile;
    const fileUrl = store.fileUrl;

    try {
      // For client-side demo, we'll simulate processing
      // In production, this would call the API
      const mockJobId = Math.random().toString(36).substring(7);

      ffmpegStore.setState((prev) => ({
        ...prev,
        currentJob: {
          id: mockJobId,
          inputPath: fileUrl,
          parameters: store.parameters,
          status: "processing",
          progress: 0,
        } as ProcessingJob,
        isProcessing: true,
      }));

      // Simulate progress with SSE-like behavior
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 5;
        if (progress >= 100) {
          clearInterval(interval);
          ffmpegStore.setState((prev) => ({
            ...prev,
            isProcessing: false,
            currentJob: prev.currentJob
              ? {
                  ...prev.currentJob,
                  status: "completed" as const,
                  progress: 100,
                  outputPath: `~/ffmpego_edits/${selectedFile.name}`,
                }
              : null,
          }));
        } else {
          ffmpegStore.setState((prev) => ({
            ...prev,
            currentJob: prev.currentJob
              ? { ...prev.currentJob, progress }
              : null,
            isProcessing: true,
          }));
        }
      }, 500);
    } catch (error) {
      ffmpegStore.setState((prev) => ({
        ...prev,
        isProcessing: false,
        currentJob: prev.currentJob
          ? {
              ...prev.currentJob,
              status: "failed" as const,
              progress: 100,
              error: String(error),
            }
          : null,
      }));
    }
  }, [store.selectedFile, store.fileUrl, store.parameters, ffmpegStore]);

  const handleReset = useCallback(() => {
    ffmpegStore.setState((prev) => ({
      selectedFile: null,
      fileUrl: null,
      parameters: { format: "mp4", quality: "medium" },
      currentJob: null,
      isProcessing: false,
    }));
  }, [ffmpegStore]);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <header className="text-center space-y-2">
          <h1 className="text-3xl font-bold">FFmpeg Editor</h1>
          <p className="text-muted-foreground">
            Convert, trim, and optimize your videos locally
          </p>
        </header>

        {/* Main Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* File Dropzone */}
          <FileDropzone
            onFileSelect={handleFileSelect}
            selectedFile={store.selectedFile}
          />

          {/* Parameter Selector */}
          <ParameterSelector
            parameters={store.parameters}
            onParamsChange={handleParamsChange}
          />
        </div>

        {/* Processing Status or Submit Button */}
        {store.currentJob ? (
          <ProcessingProgress job={store.currentJob} onReset={handleReset} />
        ) : (
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={!store.selectedFile || store.isProcessing}
            className="w-full"
          >
            {store.isProcessing ? "Processing..." : "Process Video"}
          </Button>
        )}

        {/* Footer - Output Path Info */}
        <footer className="text-center text-sm text-muted-foreground">
          All processed files are saved to: ~/ffmpego_edits/
        </footer>
      </div>
    </div>
  );
}
