<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  code: string;
}>();

interface ColoredToken {
  text: string;
  color: string;
}

const KEYWORD_RE =
  /\b(import|export|from|const|let|var|function|class|extends|return|if|else|new|this|typeof|void|async|await|default|super)\b/;
const STRING_RE = /^(['"`].*?['"`])/;
const COMMENT_RE = /^(\/\/.*)/;

const lines = computed(() => {
  return props.code
    .split("\n")
    .slice(0, 5)
    .map((line) => tokenize(line));
});

function tokenize(line: string): ColoredToken[] {
  const tokens: ColoredToken[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    // Comments
    const commentMatch = remaining.match(COMMENT_RE);
    if (commentMatch) {
      tokens.push({ text: commentMatch[1], color: "#6b7280" });
      remaining = remaining.slice(commentMatch[1].length);
      continue;
    }

    // Strings
    const stringMatch = remaining.match(STRING_RE);
    if (stringMatch) {
      tokens.push({ text: stringMatch[1], color: "#86efac" });
      remaining = remaining.slice(stringMatch[1].length);
      continue;
    }

    // Keywords
    const keywordMatch = remaining.match(KEYWORD_RE);
    if (keywordMatch && remaining.indexOf(keywordMatch[1]) === 0) {
      tokens.push({ text: keywordMatch[1], color: "#c084fc" });
      remaining = remaining.slice(keywordMatch[1].length);
      continue;
    }

    // Default: take one character
    tokens.push({ text: remaining[0], color: "#d4d4d4" });
    remaining = remaining.slice(1);
  }

  return tokens;
}
</script>

<template>
  <div class="w-20 h-12 bg-zinc-950 rounded overflow-hidden p-1 flex-shrink-0">
    <div
      v-for="(line, i) in lines"
      :key="i"
      class="whitespace-pre overflow-hidden"
      style="font-size: 5px; line-height: 1.6; font-family: monospace"
    >
      <span v-for="(token, j) in line" :key="j" :style="{ color: token.color }">{{
        token.text
      }}</span>
    </div>
  </div>
</template>
