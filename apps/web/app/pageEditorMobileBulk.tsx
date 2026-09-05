"use client";

import { BulkArea } from "@/components/editor/bulk/BulkArea";
import { BulkEmptyState } from "@/components/editor/bulk/BulkEmptyState";
import { BulkHeader } from "@/components/editor/bulk/BulkHeader";
import { BulkItemCard } from "@/components/editor/bulk/BulkItemCard";
import { BulkSettingsPanel } from "@/components/editor/bulk/BulkSettingsPanel";
import { useBulkEditorState } from "@/components/editor/bulk/hooks";
import { useBulkExport } from "@/components/editor/bulk/useBulkExport";

export default function MobileBulkEditorPage() {
  const {
    items,
    itemsRef,
    stackedLayout,
    layoutError,
    splitLabel,
    useWatermark,
    setUseWatermark,
    inputFolderName,
    outputDirHandle,
    outputDirName,
    folderInputRef,
    patchItem,
    handleMeta,
    onFolderChosen,
    pickInputFolder,
    pickOutputFolder,
    syncLayout,
    setAllSelected,
    selectedCount,
    completedCount,
    failedCount,
  } = useBulkEditorState();

  const { isExporting, onBulkExport } = useBulkExport({
    itemsRef,
    stackedLayout,
    layoutError,
    outputDirHandle,
    useWatermark,
    patchItem,
  });

  // -- empty state ------------------------------------------------------------

  if (items.length === 0) {
    return (
      <BulkEmptyState
        folderInputRef={folderInputRef}
        onFolderChosen={onFolderChosen}
        onPickInput={pickInputFolder}
      />
    );
  }

  // -- main -------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        tabIndex={-1}
        onChange={(e) => {
          onFolderChosen(e.target.files);
          e.target.value = "";
        }}
      />
      <BulkHeader
        inputFolderName={inputFolderName}
        total={items.length}
        selectedCount={selectedCount}
        completedCount={completedCount}
        failedCount={failedCount}
        splitLabel={splitLabel}
        isExporting={isExporting}
        onSelectAll={() => setAllSelected(true)}
        onSelectNone={() => setAllSelected(false)}
        onBulkExport={onBulkExport}
      />

      {/* Bulk area — control & readout surface, mirrors pageEditorCrop CropArea */}
      <BulkArea
        layout={stackedLayout}
        total={items.length}
        selectedCount={selectedCount}
        completedCount={completedCount}
        failedCount={failedCount}
        splitLabel={splitLabel}
        useWatermark={useWatermark}
        inputFolderName={inputFolderName}
        outputDirName={outputDirName}
        isExporting={isExporting}
        onSync={syncLayout}
        onOutput={() => void pickOutputFolder()}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((it) => (
            <BulkItemCard
              key={it.id}
              item={it}
              stackedLayout={stackedLayout}
              useWatermark={useWatermark}
              isExporting={isExporting}
              onPatch={patchItem}
              onMeta={handleMeta}
            />
          ))}
        </div>

        <div className="space-y-4">
          <BulkSettingsPanel
            inputFolderName={inputFolderName}
            total={items.length}
            outputDirName={outputDirName}
            useWatermark={useWatermark}
            splitLabel={splitLabel}
            layoutError={layoutError}
            isExporting={isExporting}
            selectedCount={selectedCount}
            onPickInput={pickInputFolder}
            onPickOutput={pickOutputFolder}
            onWatermarkChange={setUseWatermark}
            onSync={syncLayout}
            onBulkExport={onBulkExport}
          />
        </div>
      </div>
    </div>
  );
}
