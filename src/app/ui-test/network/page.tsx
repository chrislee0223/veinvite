'use client';

import { useMemo, useState } from 'react';

type Status = 'IN_PROGRESS' | 'QUALIFIED' | 'REWARDED';
type Node = {
  id: string;
  wallet: string;
  status: Status;
  joinedThisRound?: boolean;
  children: Node[];
};

const ROOT: Node = {
  id: 'you',
  wallet: 'YOU',
  status: 'REWARDED',
  children: [
    {
      id: 'a', wallet: '0xA100…0001', status: 'REWARDED', children: [
        { id: 'a1', wallet: '0xA110…0011', status: 'QUALIFIED', joinedThisRound: true, children: [
          { id: 'a11', wallet: '0xA111…0111', status: 'REWARDED', joinedThisRound: true, children: [] },
          { id: 'a12', wallet: '0xA112…0112', status: 'IN_PROGRESS', joinedThisRound: true, children: [] },
        ] },
        { id: 'a2', wallet: '0xA120…0012', status: 'REWARDED', children: [
          { id: 'a21', wallet: '0xA121…0121', status: 'QUALIFIED', joinedThisRound: true, children: [] },
        ] },
        { id: 'a3', wallet: '0xA130…0013', status: 'IN_PROGRESS', joinedThisRound: true, children: [] },
        { id: 'a4', wallet: '0xA140…0014', status: 'QUALIFIED', joinedThisRound: true, children: [] },
      ],
    },
    {
      id: 'b', wallet: '0xB200…0002', status: 'QUALIFIED', children: [
        { id: 'b1', wallet: '0xB210…0021', status: 'REWARDED', children: [
          { id: 'b11', wallet: '0xB211…0211', status: 'QUALIFIED', joinedThisRound: true, children: [] },
        ] },
        { id: 'b2', wallet: '0xB220…0022', status: 'QUALIFIED', joinedThisRound: true, children: [] },
        { id: 'b3', wallet: '0xB230…0023', status: 'IN_PROGRESS', joinedThisRound: true, children: [] },
      ],
    },
    {
      id: 'c', wallet: '0xC300…0003', status: 'REWARDED', children: [
        { id: 'c1', wallet: '0xC310…0031', status: 'QUALIFIED', joinedThisRound: true, children: [] },
        { id: 'c2', wallet: '0xC320…0032', status: 'IN_PROGRESS', joinedThisRound: true, children: [] },
      ],
    },
    {
      id: 'd', wallet: '0xD400…0004', status: 'IN_PROGRESS', joinedThisRound: true, children: [
        { id: 'd1', wallet: '0xD410…0041', status: 'IN_PROGRESS', joinedThisRound: true, children: [] },
      ],
    },
    { id: 'e', wallet: '0xE500…0005', status: 'QUALIFIED', joinedThisRound: true, children: [] },
  ],
};

function flatten(node: Node): Node[] {
  return node.children.flatMap((child) => [child, ...flatten(child)]);
}

function networkCount(node: Node) {
  return flatten(node).length;
}

function qualifiedCount(node: Node) {
  return flatten(node).filter((item) => item.status !== 'IN_PROGRESS').length;
}

function roundCount(node: Node) {
  return flatten(node).filter((item) => item.joinedThisRound).length;
}

function findPath(root: Node, target: string, path: Node[] = []): Node[] | null {
  const next = [...path, root];
  if (root.id === target) return next;
  for (const child of root.children) {
    const result = findPath(child, target, next);
    if (result) return result;
  }
  return null;
}

function statusLabel(status: Status) {
  if (status === 'REWARDED') return '보상 완료';
  if (status === 'QUALIFIED') return '미션 완료';
  return '진행 중';
}

function statusMark(status: Status) {
  if (status === 'REWARDED') return '◆';
  if (status === 'QUALIFIED') return '✓';
  return '•';
}

export default function NetworkPreviewPage() {
  const [focusId, setFocusId] = useState('you');
  const path = useMemo(() => findPath(ROOT, focusId) ?? [ROOT], [focusId]);
  const focus = path[path.length - 1];
  const featured = focus.children.slice(0, 3);
  const hiddenCount = Math.max(0, focus.children.length - featured.length);
  const total = networkCount(focus);
  const qualified = qualifiedCount(focus);
  const thisRound = roundCount(focus);

  return (
    <main className="previewShell">
      <div className="previewFrame">
        <div className="previewNotice">
          <strong>Network UI Preview</strong>
          <span>Sample data · no wallet required</span>
        </div>

        <header className="pageHeader">
          <div>
            <span className="sectionEyebrow">NETWORK</span>
            <h1>{focus.id === 'you' ? '내 네트워크' : '네트워크 탐색'}</h1>
          </div>
          <button className="searchButton" aria-label="네트워크 검색">⌕</button>
        </header>

        {path.length > 1 ? (
          <nav className="breadcrumbs" aria-label="Network path">
            {path.map((node, index) => (
              <span key={node.id}>
                {index > 0 && <i>›</i>}
                <button onClick={() => setFocusId(node.id)} className={index === path.length - 1 ? 'current' : ''}>
                  {node.id === 'you' ? '내 네트워크' : node.wallet}
                </button>
              </span>
            ))}
          </nav>
        ) : null}

        <section className="summaryLine" aria-label="Network summary">
          <span><b>{total}</b> Network</span>
          <i />
          <span><b>{focus.children.length}</b> Direct</span>
          <i />
          <span><b>{qualified}</b> Qualified</span>
          <i />
          <span className="growth"><b>+{thisRound}</b> This Round</span>
        </section>

        <section className="treePanel">
          <div className="treeGlow" />
          <div className="focusNode">
            <div className="focusAvatar">{focus.id === 'you' ? 'YOU' : statusMark(focus.status)}</div>
            <strong>{focus.id === 'you' ? 'You' : focus.wallet}</strong>
            <span>{total} network</span>
          </div>

          {featured.length > 0 ? (
            <>
              <div className="verticalLine" />
              <div className={`branchRail count-${featured.length}`} />
              <div className={`childRow count-${featured.length}`}>
                {featured.map((child) => (
                  <button key={child.id} className="childNode" onClick={() => setFocusId(child.id)}>
                    <span className={`statusDot ${child.status.toLowerCase()}`}>{statusMark(child.status)}</span>
                    <strong>{child.wallet}</strong>
                    <small>{networkCount(child)} network</small>
                  </button>
                ))}
              </div>
              {hiddenCount > 0 ? (
                <button className="moreBranches" onClick={() => document.getElementById('direct-list')?.scrollIntoView({ behavior: 'smooth' })}>
                  +{hiddenCount} more
                </button>
              ) : null}
            </>
          ) : (
            <div className="leafState">이 사용자 아래에는 아직 네트워크가 없어요.</div>
          )}
        </section>

        <section className="directSection" id="direct-list">
          <div className="sectionHeader">
            <div>
              <span className="sectionEyebrow">DIRECT NETWORK</span>
              <h2>직접 네트워크</h2>
            </div>
            {focus.id !== 'you' ? (
              <button className="backMine" onClick={() => setFocusId('you')}>내 네트워크로</button>
            ) : null}
          </div>

          {focus.children.length > 0 ? (
            <div className="memberList">
              {focus.children.map((child) => (
                <button className="memberCard" key={child.id} onClick={() => setFocusId(child.id)}>
                  <div className="memberIdentity">
                    <span className={`memberStatus ${child.status.toLowerCase()}`}>{statusMark(child.status)}</span>
                    <div>
                      <strong>{child.wallet}</strong>
                      <small>{statusLabel(child.status)}</small>
                    </div>
                  </div>
                  <div className="memberNumbers">
                    <span><b>{networkCount(child)}</b><small>Network</small></span>
                    <span><b>{qualifiedCount(child)}</b><small>Qualified</small></span>
                    <span className="roundNumber"><b>+{roundCount(child)}</b><small>This Round</small></span>
                  </div>
                  <span className="chevron">›</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="emptyCard">
              <strong>여기서 새로운 분기가 시작돼요</strong>
              <span>이 사용자가 새로운 사용자를 초대하면 이 아래에 연결됩니다.</span>
            </div>
          )}
        </section>
      </div>

      <style jsx global>{`
        html,body{margin:0;min-height:100%;background:#080806;color:#f4f1e8}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button{font:inherit}
      `}</style>
      <style jsx>{`
        .previewShell{min-height:100vh;padding:18px 18px 70px;box-sizing:border-box;background:radial-gradient(circle at 50% -120px,rgba(244,183,40,.07),transparent 420px),#080806}.previewFrame{width:min(100%,820px);margin:0 auto}.previewNotice{width:min(100%,520px);margin:0 auto 28px;padding:9px 12px;box-sizing:border-box;display:flex;justify-content:space-between;gap:12px;border:1px solid rgba(255,205,80,.09);border-radius:12px;background:rgba(255,255,255,.02);color:#716d64;font-size:10px}.previewNotice strong{color:#b99135}.pageHeader{display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:10px}.sectionEyebrow{display:block;color:#c89d37;font-size:10px;font-weight:900;letter-spacing:.12em}.pageHeader h1,.sectionHeader h2{margin:5px 0 0;color:#f7f3ea;letter-spacing:-.04em}.pageHeader h1{font-size:30px}.sectionHeader h2{font-size:21px}.searchButton{width:38px;height:38px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.025);color:#99938a;font-size:22px;cursor:pointer}.breadcrumbs{display:flex;align-items:center;gap:2px;margin:8px 0 14px;overflow-x:auto;scrollbar-width:none}.breadcrumbs span{display:flex;align-items:center;flex:0 0 auto}.breadcrumbs i{margin:0 3px;color:#49463f;font-style:normal}.breadcrumbs button{padding:3px 4px;border:0;background:transparent;color:#6f6a61;font-size:11px;font-weight:750;cursor:pointer}.breadcrumbs button.current{color:#c6bdab}.summaryLine{min-height:42px;padding:0 2px;display:flex;align-items:center;gap:11px;color:#7f7a70;font-size:11px;font-weight:700}.summaryLine span{white-space:nowrap}.summaryLine b{margin-right:3px;color:#ddd7cb;font-size:13px}.summaryLine>i{width:2px;height:2px;border-radius:50%;background:#4f4b44}.summaryLine .growth b{color:#d4a93e}.treePanel{position:relative;min-height:330px;margin-top:5px;padding:38px 34px 32px;box-sizing:border-box;overflow:hidden;border:1px solid rgba(255,255,255,.07);border-radius:24px;background:rgba(255,255,255,.017)}.treeGlow{position:absolute;top:-150px;left:50%;width:430px;height:300px;transform:translateX(-50%);border-radius:50%;background:radial-gradient(circle,rgba(244,183,40,.08),transparent 68%);pointer-events:none}.focusNode{position:relative;z-index:4;width:150px;margin:0 auto;display:flex;flex-direction:column;align-items:center;text-align:center}.focusAvatar{width:54px;height:54px;display:grid;place-items:center;border:1px solid rgba(244,183,40,.42);border-radius:50%;background:#15130d;box-shadow:0 0 0 7px rgba(244,183,40,.035);color:#e1b548;font-size:11px;font-weight:950}.focusNode strong{margin-top:10px;color:#eee9df;font-size:12px}.focusNode span{margin-top:3px;color:#69655e;font-size:10px}.verticalLine{width:1px;height:34px;margin:11px auto 0;background:linear-gradient(rgba(214,167,54,.52),rgba(214,167,54,.22))}.branchRail{position:absolute;top:177px;left:20%;right:20%;height:1px;background:rgba(214,167,54,.22)}.branchRail.count-1{display:none}.branchRail.count-2{left:33%;right:33%}.childRow{position:relative;z-index:3;width:min(100%,620px);margin:0 auto;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.childRow.count-1{grid-template-columns:minmax(0,190px);justify-content:center}.childRow.count-2{grid-template-columns:repeat(2,minmax(0,190px));justify-content:center}.childNode{position:relative;min-width:0;min-height:86px;padding:19px 12px 11px;border:1px solid rgba(255,255,255,.07);border-radius:17px;background:#0d0d0a;color:#d9d4ca;text-align:center;cursor:pointer;transition:transform .14s ease,border-color .14s ease,background .14s ease}.childNode:hover{transform:translateY(-2px);border-color:rgba(244,183,40,.18);background:#11100c}.childNode::before{content:'';position:absolute;top:-18px;left:50%;width:1px;height:18px;background:rgba(214,167,54,.24)}.statusDot{position:absolute;top:-10px;left:50%;width:20px;height:20px;display:grid;place-items:center;transform:translateX(-50%);border:1px solid rgba(255,255,255,.1);border-radius:50%;background:#11110e;color:#77736c;font-size:9px;font-weight:950}.statusDot.qualified,.memberStatus.qualified{color:#66cf9b;border-color:rgba(102,207,155,.25)}.statusDot.rewarded,.memberStatus.rewarded{color:#dcb44e;border-color:rgba(220,180,78,.28)}.childNode strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.childNode small{display:block;margin-top:5px;color:#68645d;font-size:9px}.moreBranches{display:block;margin:14px auto 0;padding:5px 10px;border:0;border-radius:999px;background:rgba(255,255,255,.035);color:#777168;font-size:10px;font-weight:800;cursor:pointer}.leafState{margin:38px auto 0;color:#625e57;font-size:11px;text-align:center}.directSection{margin-top:28px;scroll-margin-top:18px}.sectionHeader{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:12px}.backMine{padding:7px 10px;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:transparent;color:#858077;font-size:10px;font-weight:800;cursor:pointer}.memberList{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.memberCard{position:relative;min-width:0;padding:14px 42px 14px 14px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px;border:1px solid rgba(255,255,255,.065);border-radius:17px;background:rgba(255,255,255,.018);color:inherit;text-align:left;cursor:pointer;transition:background .14s ease,border-color .14s ease}.memberCard:hover{border-color:rgba(244,183,40,.15);background:rgba(244,183,40,.025)}.memberIdentity{min-width:0;display:flex;align-items:center;gap:10px}.memberStatus{width:28px;height:28px;display:grid;place-items:center;flex:0 0 auto;border:1px solid rgba(255,255,255,.09);border-radius:50%;color:#7b776f;font-size:10px;font-weight:950}.memberIdentity div{min-width:0}.memberIdentity strong{display:block;overflow:hidden;color:#ddd8ce;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.memberIdentity small{display:block;margin-top:3px;color:#706c65;font-size:9px}.memberNumbers{display:flex;align-items:center;gap:13px}.memberNumbers span{min-width:42px;text-align:right}.memberNumbers b{display:block;color:#d9d4ca;font-size:12px}.memberNumbers small{display:block;margin-top:2px;color:#5e5a54;font-size:8px;white-space:nowrap}.memberNumbers .roundNumber b{color:#c8a03e}.chevron{position:absolute;right:14px;top:50%;transform:translateY(-50%);color:#57534d;font-size:18px}.emptyCard{padding:28px;border:1px solid rgba(255,255,255,.06);border-radius:17px;background:rgba(255,255,255,.015);text-align:center}.emptyCard strong{display:block;color:#cfc9bd;font-size:12px}.emptyCard span{display:block;margin-top:5px;color:#69655f;font-size:10px}
        @media(max-width:700px){.previewShell{padding:14px 10px 54px}.previewFrame{width:min(100%,520px)}.previewNotice{margin-bottom:21px}.pageHeader h1{font-size:26px}.summaryLine{gap:7px;font-size:9px;overflow-x:auto;scrollbar-width:none}.summaryLine b{font-size:11px}.treePanel{min-height:300px;padding:34px 13px 28px;border-radius:22px}.focusAvatar{width:50px;height:50px}.branchRail{top:169px;left:17%;right:17%}.childRow{gap:8px}.childNode{min-height:78px;padding:18px 6px 9px}.childNode strong{font-size:9px}.childNode small{font-size:8px}.memberList{grid-template-columns:1fr}.memberCard{padding:13px 38px 13px 12px}.memberNumbers{gap:8px}.memberNumbers span{min-width:38px}}
        @media(max-width:390px){.previewNotice{align-items:flex-start;flex-direction:column;gap:2px}.treePanel{padding-left:8px;padding-right:8px}.childRow{gap:5px}.childNode strong{font-size:8px}.memberNumbers small{font-size:7px}}
      `}</style>
    </main>
  );
}
