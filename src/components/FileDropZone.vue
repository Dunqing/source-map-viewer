<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import IconUpload from "~icons/carbon/upload";

const emit = defineEmits<{
  drop: [files: File[]];
}>();

const isDragging = ref(false);
let dragCounter = 0;

function onDocumentDragEnter(e: DragEvent) {
  e.preventDefault();
  dragCounter++;
  isDragging.value = true;
}

function onDocumentDragLeave(e: DragEvent) {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    isDragging.value = false;
  }
}

function onDocumentDragOver(e: DragEvent) {
  e.preventDefault();
}

function onDrop(e: DragEvent) {
  e.preventDefault();
  dragCounter = 0;
  isDragging.value = false;
  const files = Array.from(e.dataTransfer?.files ?? []);
  if (files.length > 0) {
    emit("drop", files);
  }
}

onMounted(() => {
  document.addEventListener("dragenter", onDocumentDragEnter);
  document.addEventListener("dragleave", onDocumentDragLeave);
  document.addEventListener("dragover", onDocumentDragOver);
  document.addEventListener("drop", onDrop);
});

onUnmounted(() => {
  document.removeEventListener("dragenter", onDocumentDragEnter);
  document.removeEventListener("dragleave", onDocumentDragLeave);
  document.removeEventListener("dragover", onDocumentDragOver);
  document.removeEventListener("drop", onDrop);
});
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-blue-500/20 backdrop-blur-sm transition-opacity"
    :class="isDragging ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'"
  >
    <div
      class="rounded-xl border-2 border-dashed border-blue-500 bg-surface px-12 py-8 text-center"
    >
      <IconUpload class="w-10 h-10 text-blue-500 mb-2" />
      <p class="text-lg font-medium">Drop files here</p>
      <p class="text-sm text-fg-muted">
        Generated/source files and source maps (.js, .ts, .vue, .svelte, .astro, .css, .map, .json)
      </p>
    </div>
  </div>
</template>
