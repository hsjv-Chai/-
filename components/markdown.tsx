import React from "react";
function inline(text: string): React.ReactNode[] {
  const pattern =
    /(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>]+|\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  return text.split(pattern).map((part, i) => {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link)
      return (
        <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer">
          {link[1]}
        </a>
      );
    if (/^https?:\/\//.test(part))
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer">
          {part}
        </a>
      );
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}
export default function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const content = [];
      while (++i < lines.length && !lines[i].startsWith("```"))
        content.push(lines[i]);
      blocks.push(
        <pre key={i}>
          <code>{content.join("\n")}</code>
        </pre>,
      );
    } else if (/^#{1,3} /.test(line)) {
      const level = line.match(/^#+/)![0].length;
      blocks.push(
        React.createElement(
          `h${level + 1}`,
          { key: i },
          inline(line.slice(level + 1)),
        ),
      );
    } else if (/^> /.test(line)) {
      blocks.push(<blockquote key={i}>{inline(line.slice(2))}</blockquote>);
    } else if (/^([-*] |\d+\. )/.test(line)) {
      const ordered = /^\d/.test(line),
        items = [];
      do {
        items.push(
          <li key={i}>{inline(lines[i].replace(/^([-*] |\d+\. )/, ""))}</li>,
        );
        i++;
      } while (
        i < lines.length &&
        (ordered ? /^\d+\. / : /^[-*] /).test(lines[i])
      );
      i--;
      blocks.push(
        ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>,
      );
    } else if (line.trim()) blocks.push(<p key={i}>{inline(line)}</p>);
  }
  return <div className="markdown">{blocks}</div>;
}
