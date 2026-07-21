"use client";

import { useCallback, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
}

export function FileDropzone({
  onFileSelect,
  selectedFile,
}: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (
        file &&
        (file.type.startsWith("video/") ||
          file.name.match(/\.(mp4|avi|mkv|mov|wmv|flv)$/i))
      ) {
        onFileSelect(file);
      }
    },
    [onFileSelect],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onFileSelect(file);
      }
    },
    [onFileSelect],
  );

  if (selectedFile) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onFileSelect(null)}
          >
            Remove
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "border-2 border-dashed p-8 transition-colors",
        isDragging ? "border-primary bg-primary/10" : "border-border",
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex flex-col items-center gap-4">
        <UploadCloud className="w-12 h-12 text-muted-foreground" />
        <div className="text-center">
          <p className="text-lg font-medium">Drop your video file here</p>
          <p className="text-sm text-muted-foreground">or click to browse</p>
        </div>
        <input
          type="file"
          accept="video/*,.mp4,.avi,.mkv,.mov,.wmv,.flv"
          onChange={handleInputChange}
          className="hidden"
          id="file-input"
        />
        <Button
          variant="secondary"
          onClick={() => document.getElementById("file-input")?.click()}
        >
          Browse Files
        </Button>
      </div>
    </Card>
  );
}
