import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type { ProgramWithPerformers } from "@/lib/queries/programs";
import { ProgramList } from "./program-list";

const meta = {
  component: ProgramList,
  args: {
    onReorder: fn(async () => null),
    onDelete: fn(async () => null),
    onEdit: fn(),
    onAdd: fn(),
  },
} satisfies Meta<typeof ProgramList>;

export default meta;
type Story = StoryObj<typeof meta>;

const samplePrograms: ProgramWithPerformers[] = [
  {
    id: "p1",
    sortOrder: 1,
    type: "greeting",
    scheduledTime: "14:00",
    estimatedDuration: 5,
    note: null,
    performers: [],
    pieces: [
      { id: "pc0", sortOrder: 1, title: "開会のあいさつ", composer: null },
    ],
  },
  {
    id: "p2",
    sortOrder: 2,
    type: "performance",
    scheduledTime: "14:10",
    estimatedDuration: 12,
    note: null,
    performers: [{ id: "pp1", memberId: "m1", displayName: "田中太郎" }],
    pieces: [
      {
        id: "pc1",
        sortOrder: 1,
        title: "月光 第1楽章",
        composer: "ベートーヴェン",
      },
      {
        id: "pc1b",
        sortOrder: 2,
        title: "エリーゼのために",
        composer: "ベートーヴェン",
      },
    ],
  },
  {
    id: "p3",
    sortOrder: 3,
    type: "intermission",
    scheduledTime: null,
    estimatedDuration: 10,
    note: null,
    performers: [],
    pieces: [{ id: "pc2", sortOrder: 1, title: "休憩", composer: null }],
  },
  {
    id: "p4",
    sortOrder: 4,
    type: "performance",
    scheduledTime: "14:30",
    estimatedDuration: 5,
    note: null,
    performers: [{ id: "pp2", memberId: "m2", displayName: "鈴木花子" }],
    pieces: [
      {
        id: "pc3",
        sortOrder: 1,
        title: "子犬のワルツ",
        composer: "ショパン",
      },
    ],
  },
  {
    id: "p5",
    sortOrder: 5,
    type: "performance",
    scheduledTime: "14:40",
    estimatedDuration: 15,
    note: null,
    performers: [
      { id: "pp3", memberId: "m1", displayName: "田中太郎" },
      { id: "pp4", memberId: "m2", displayName: "鈴木花子" },
    ],
    pieces: [
      {
        id: "pc4",
        sortOrder: 1,
        title: "愛の夢 第3番",
        composer: "リスト",
      },
      {
        id: "pc5",
        sortOrder: 2,
        title: "ラ・カンパネラ",
        composer: "リスト",
      },
      {
        id: "pc6",
        sortOrder: 3,
        title: "別れの曲",
        composer: "ショパン",
      },
    ],
  },
];

export const Default: Story = {
  args: {
    eventId: "event-1",
    programs: samplePrograms,

    canModify: true,
  },
};

export const SingleItem: Story = {
  args: {
    eventId: "event-1",
    programs: [samplePrograms[1]],

    canModify: true,
  },
};

export const Empty: Story = {
  args: {
    eventId: "event-1",
    programs: [],

    canModify: true,
  },
};

export const ReadOnly: Story = {
  args: {
    eventId: "event-1",
    programs: samplePrograms,

    canModify: false,
  },
};
