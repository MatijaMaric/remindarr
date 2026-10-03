import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as api from "../../api";
import { OWNED_FORMATS, type OwnedFormat, type Title } from "../../types";

type DetailData = { title: Title };

interface Props {
  titleId: string;
  formats: OwnedFormat[];
}

/** "Owned" row in Where to Watch: owned-format chips plus a picker to edit them. */
export default function OwnedMediaRow({ titleId, formats }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const queryKey = ["title-detail", titleId];

  const setCached = (next: OwnedFormat[]) =>
    qc.setQueryData<DetailData>(queryKey, (d) =>
      d ? { ...d, title: { ...d.title, owned_formats: next } } : d,
    );

  const mutation = useMutation({
    mutationFn: (next: OwnedFormat[]) => api.setOwnedFormats(titleId, next),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey });
      setCached(next);
      return { prev: formats };
    },
    onError: (_err, _next, ctx) => {
      if (ctx) setCached(ctx.prev);
      toast.error(t("owned.saveError"));
    },
  });

  function toggle(format: OwnedFormat) {
    const has = formats.includes(format);
    mutation.mutate(
      OWNED_FORMATS.filter((f) => (f === format ? !has : formats.includes(f))),
    );
  }

  return (
    <div className="flex items-start gap-3.5">
      <div className="w-[70px] shrink-0 pt-1.5 text-sm text-zinc-400">
        {t("owned.row")}
      </div>
      <div className="flex flex-wrap gap-2 items-center min-h-8">
        {formats.map((f) => (
          <span
            key={f}
            className="inline-flex items-center rounded-lg px-2.5 py-1.5 text-sm text-zinc-300 bg-amber-400/[0.12] border-l-[3px] border-amber-400"
          >
            {t(`owned.formats.${f}`)}
          </span>
        ))}
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-lg px-2.5 py-1.5 text-xs text-zinc-400 hover:text-white border border-white/[0.12]">
            {formats.length > 0 ? t("owned.edit") : t("owned.add")}
          </summary>
          <fieldset className="absolute z-10 mt-1 flex flex-col gap-1.5 rounded-lg border border-white/[0.12] bg-zinc-900 p-3 shadow-lg">
            <legend className="sr-only">{t("owned.pickerLabel")}</legend>
            {OWNED_FORMATS.map((f) => (
              <label
                key={f}
                className="flex items-center gap-2 whitespace-nowrap text-sm text-zinc-200 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={formats.includes(f)}
                  disabled={mutation.isPending}
                  onChange={() => toggle(f)}
                />
                {t(`owned.formats.${f}`)}
              </label>
            ))}
          </fieldset>
        </details>
      </div>
    </div>
  );
}
