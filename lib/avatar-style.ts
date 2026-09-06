export type HairStyleId = 'short' | 'medium' | 'long' | 'curly';
export type AvatarAccessory = 'none' | 'glasses';

export type AvatarStyle = {
  hairStyleId: HairStyleId;
  hairColor: string;
  skinTone: string;
  topColor: string;
  bottomColor: string;
  accessory: AvatarAccessory;
};

export const defaultAvatarStyle: AvatarStyle = {
  hairStyleId: 'short',
  hairColor: '#4d214f',
  skinTone: '#ffd1b5',
  topColor: '#8256e8',
  bottomColor: '#f4efe4',
  accessory: 'none',
};

export const hairStyleOptions: Array<{ id: HairStyleId; label: string }> = [
  { id: 'short', label: '利落短发' },
  { id: 'medium', label: '蓬松中发' },
  { id: 'long', label: '柔顺长发' },
  { id: 'curly', label: '轻卷发' },
];

const hairStyles = new Set<HairStyleId>(hairStyleOptions.map((option) => option.id));

export function normalizeAvatarStyle(value: Partial<AvatarStyle> | undefined): AvatarStyle {
  return {
    hairStyleId: value?.hairStyleId && hairStyles.has(value.hairStyleId) ? value.hairStyleId : defaultAvatarStyle.hairStyleId,
    hairColor: safeHex(value?.hairColor, defaultAvatarStyle.hairColor),
    skinTone: safeHex(value?.skinTone, defaultAvatarStyle.skinTone),
    topColor: safeHex(value?.topColor, defaultAvatarStyle.topColor),
    bottomColor: safeHex(value?.bottomColor, defaultAvatarStyle.bottomColor),
    accessory: value?.accessory === 'glasses' ? 'glasses' : 'none',
  };
}

function safeHex(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}
