'use client';

import type {
  MouseEvent,
} from 'react';

import type {
  NetworkWorkspaceGroup,
} from '@/lib/networkWorkspace';
import {
  GroupsControlGlyph,
} from './NetworkGlyphs';

export function PublicNetworkOwnerGroups({
  groups,
  groupFallback,
  peopleCount,
  shouldIgnoreClick,
  onToggle,
}: {
  groups: NetworkWorkspaceGroup[];
  groupFallback: string;
  peopleCount: string;
  shouldIgnoreClick: () => boolean;
  onToggle: (groupId: string) => void;
}) {
  const handleClick = (
    event: MouseEvent<HTMLButtonElement>,
    groupId: string,
  ) => {
    event.stopPropagation();
    if (shouldIgnoreClick()) return;
    onToggle(groupId);
  };

  return (
    <>
      {groups.map((group) => (
        <button
          type="button"
          className={`publicGroupNode${group.collapsed === false ? ' expanded' : ''}`}
          key={group.id}
          style={{
            left: group.x,
            top: group.y,
          }}
          data-network-interactive="true"
          aria-expanded={
            group.collapsed === false
          }
          onContextMenu={(event) =>
            event.preventDefault()
          }
          onDragStart={(event) =>
            event.preventDefault()
          }
          onClick={(event) =>
            handleClick(event, group.id)
          }
        >
          <span
            className="publicGroupGlyph"
            aria-hidden="true"
          >
            <GroupsControlGlyph size={16} />
          </span>
          <strong dir="auto">
            {group.label || groupFallback}
          </strong>
          <small>
            {peopleCount.replace(
              '{count}',
              String(group.members.length),
            )}
          </small>
        </button>
      ))}
      <style jsx>{`
        .publicGroupNode {
          position:absolute;
          z-index:7;
          transform:translate(-50%,-50%);
          min-width:92px;
          max-width:150px;
          min-height:54px;
          padding:7px 10px;
          display:grid;
          grid-template-columns:24px minmax(0,1fr);
          grid-template-rows:auto auto;
          column-gap:7px;
          align-items:center;
          border:1px solid rgba(244,183,40,.2);
          border-radius:14px;
          background:rgba(22,20,14,.96);
          color:#d8c786;
          font:inherit;
          text-align:start;
          box-shadow:0 9px 24px rgba(0,0,0,.28);
          cursor:pointer;
          touch-action:none;
          user-select:none;
          -webkit-user-select:none;
        }
        .publicGroupNode:hover,
        .publicGroupNode.expanded {
          border-color:rgba(244,183,40,.38);
          background:rgba(30,25,14,.97);
        }
        .publicGroupGlyph {
          grid-row:1 / span 2;
          width:24px;
          height:24px;
          display:grid;
          place-items:center;
          border-radius:8px;
          background:rgba(244,183,40,.08);
          color:#d6ad43;
        }
        .publicGroupNode strong {
          min-width:0;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
          font-size:.59rem;
          font-weight:900;
        }
        .publicGroupNode small {
          color:#827b6e;
          font-size:.49rem;
          font-weight:750;
        }
      `}</style>
    </>
  );
}
