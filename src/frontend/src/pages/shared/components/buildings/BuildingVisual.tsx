// Building visual for cards — realistic building facade filling the card width
export function BuildingVisual({ floors, entrances, color }: { floors: number; entrances: number; color: string }) {
  const displayFloors = Math.min(floors, 10);
  const displayEntrances = Math.min(entrances, 6);
  const windowsPerEntrance = 4;

  const isLit = (f: number, c: number) => {
    const seed = (f * 7 + c * 13) % 10;
    return seed < 6;
  };

  return (
    <div className="h-44 relative overflow-hidden rounded-t-xl" style={{ background: 'linear-gradient(180deg, #94A3B8 0%, #CBD5E1 50%, #E2E8F0 100%)' }}>
      {/* Building body — fills width */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-center">
        <div className="flex gap-[1px]" style={{ background: `${color}20`, padding: '0 2px', borderRadius: '6px 6px 0 0' }}>
          {Array.from({ length: displayEntrances }, (_, e) => (
            <div key={e} className="flex flex-col" style={{ background: color, borderRadius: e === 0 ? '5px 0 0 0' : e === displayEntrances - 1 ? '0 5px 0 0' : '0', padding: '6px 5px 0' }}>
              {/* Roof accent line */}
              <div className="h-[3px] rounded-t-sm mb-1" style={{ background: `${color}88`, marginLeft: -3, marginRight: -3 }} />
              {Array.from({ length: displayFloors }, (_, f) => (
                <div key={f} className="flex gap-[3px] mb-[3px]">
                  {Array.from({ length: windowsPerEntrance }, (_, w) => (
                    <div
                      key={w}
                      className="rounded-[2px]"
                      style={{
                        width: 11, height: 9,
                        background: isLit(f, e * windowsPerEntrance + w)
                          ? 'rgba(255,220,80,.9)'
                          : 'rgba(160,190,220,.25)',
                      }}
                    />
                  ))}
                </div>
              ))}
              {/* Door at bottom */}
              <div className="flex justify-center mt-auto pb-0">
                <div className="rounded-t-sm" style={{ width: 14, height: 10, background: 'rgba(255,255,255,.3)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ground */}
      <div className="absolute bottom-0 left-0 right-0 h-[5px]" style={{ background: `${color}25` }} />
    </div>
  );
}
