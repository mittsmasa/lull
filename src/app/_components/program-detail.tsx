import { Clock, Hourglass } from "@phosphor-icons/react";
import { Fragment } from "react";
import type { ProgramWithPerformers } from "@/lib/queries/programs";

type ProgramDetailProps = {
  program: ProgramWithPerformers;
};

// 備考テキスト中の http(s) URL をリンクに変換する。
// 末尾に付きがちな句読点・閉じ括弧は URL から除外する。
const URL_PATTERN = /(https?:\/\/[^\s]+)/g;
const TRAILING_PUNCTUATION = /[.,;:!?。、）)\]】」』]+$/;

function renderNote(note: string) {
  let offset = 0;
  // 分割により URL 部分は奇数インデックスに入る。
  // key には文字位置を使い、同一文字列が複数あっても安定・一意にする。
  return note.split(URL_PATTERN).map((part, index) => {
    const key = offset;
    offset += part.length;

    if (index % 2 === 0) {
      return <Fragment key={key}>{part}</Fragment>;
    }

    const trailing = part.match(TRAILING_PUNCTUATION)?.[0] ?? "";
    const url = trailing ? part.slice(0, -trailing.length) : part;

    return (
      <Fragment key={key}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-foreground underline underline-offset-2 transition-colors hover:text-muted-foreground"
        >
          {url}
        </a>
        {trailing}
      </Fragment>
    );
  });
}

export function ProgramDetail({ program }: ProgramDetailProps) {
  const hasMeta =
    Boolean(program.scheduledTime) || program.estimatedDuration != null;

  return (
    <div className="flex flex-col gap-6 pt-2">
      <div className="flex flex-col gap-2">
        {program.type === "performance" ? (
          <>
            {program.performers.length > 0 && (
              <span className="font-medium tracking-wide">
                {program.performers.map((p) => p.displayName).join(", ")}
              </span>
            )}
            <div className="mt-1 flex flex-col gap-2 border-l border-border/50 pl-3">
              {program.pieces.map((piece) => (
                <div key={piece.id} className="flex flex-col">
                  <span className="text-sm">{piece.title}</span>
                  {piece.composer && (
                    <span className="text-xs text-muted-foreground/70">
                      {piece.composer}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <span className="tracking-wide text-muted-foreground">
            {program.pieces[0]?.title}
          </span>
        )}
      </div>

      {hasMeta && (
        <dl className="flex gap-8 border-y border-border/40 py-3">
          {program.scheduledTime && (
            <div className="flex flex-col gap-1">
              <dt className="flex items-center gap-1.5 text-xs tracking-wide text-muted-foreground">
                <Clock size={13} />
                予定時刻
              </dt>
              <dd className="text-sm tabular-nums">
                {program.scheduledTime}〜
              </dd>
            </div>
          )}
          {program.estimatedDuration != null && (
            <div className="flex flex-col gap-1">
              <dt className="flex items-center gap-1.5 text-xs tracking-wide text-muted-foreground">
                <Hourglass size={13} />
                所要時間
              </dt>
              <dd className="text-sm tabular-nums">
                {program.estimatedDuration}分
              </dd>
            </div>
          )}
        </dl>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-xs tracking-wide text-muted-foreground">
          備考
        </span>
        {program.note?.trim() ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {renderNote(program.note)}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground/60">備考はありません</p>
        )}
      </div>
    </div>
  );
}
