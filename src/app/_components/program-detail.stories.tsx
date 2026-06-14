import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import type { ProgramWithPerformers } from "@/lib/queries/programs";
import { ProgramDetail } from "./program-detail";

const meta = {
  component: ProgramDetail,
  render: (args) => (
    <ResponsiveModal open size="sm">
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>プログラムの詳細</ResponsiveModalTitle>
        </ResponsiveModalHeader>
        <ProgramDetail {...args} />
      </ResponsiveModalContent>
    </ResponsiveModal>
  ),
} satisfies Meta<typeof ProgramDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

const performance: ProgramWithPerformers = {
  id: "p1",
  sortOrder: 1,
  type: "performance",
  scheduledTime: "14:30",
  estimatedDuration: 8,
  note: "ピアノは事前に調律済み。\n楽譜はこちら https://example.com/scores/nocturne を参照。\n転換に1分ほしいです。",
  performers: [
    { id: "pp1", memberId: "m1", displayName: "山田花子" },
    { id: "pp2", memberId: "m2", displayName: "田中太郎" },
  ],
  pieces: [
    {
      id: "pc1",
      sortOrder: 1,
      title: "ノクターン 第2番",
      composer: "F. Chopin",
    },
    { id: "pc2", sortOrder: 2, title: "愛の夢 第3番", composer: "F. Liszt" },
  ],
};

export const Performance: Story = {
  args: { program: performance },
};

export const NonPerformance: Story = {
  args: {
    program: {
      id: "p2",
      sortOrder: 2,
      type: "intermission",
      scheduledTime: null,
      estimatedDuration: 10,
      note: "ロビーで飲み物を提供します。",
      performers: [],
      pieces: [{ id: "pc3", sortOrder: 1, title: "休憩", composer: null }],
    },
  },
};
