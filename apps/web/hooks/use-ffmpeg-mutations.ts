import { useMutation, useQuery } from '@tanstack/react-query';
import { apiPost, apiGet } from '@/lib/api-client';
import type { ProcessVideoRequest, VideoProcessResponse, JobStatusResponse } from '@/lib/api-client';

// Mutation for processing videos
export function useProcessVideo() {
  return useMutation({
    mutationFn: async (params: ProcessVideoRequest) => {
      return apiPost<VideoProcessResponse>('/api/process', params);
    },
  });
}

// Query for fetching job status
export function useJobStatus(jobId: string | undefined) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: async () => {
      if (!jobId) throw new Error('Job ID is required');
      return apiGet<JobStatusResponse>(`/api/jobs/${jobId}`);
    },
    enabled: !!jobId,
    refetchInterval: 1000,
  });
}

// Query for fetching processed files
export function useProcessedFiles() {
  return useQuery({
    queryKey: ['files'],
    queryFn: async () => {
      return apiGet<{
        files: Array<{
          name: string;
          size: number;
          createdAt: string;
          modifiedAt: string;
        }>;
      }>('/api/files');
    },
    refetchInterval: 30000,
  });
}
