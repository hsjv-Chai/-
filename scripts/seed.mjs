import { sqlQuote as q, wrangler } from "./local-db.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
const queries = [];
const sql = (query) => queries.push(query);
const categories = [
  ["hot", "热点现场", "新鲜发生的事，一起聊聊"],
  ["fun", "娱乐吃瓜", "电影、音乐和那些有趣的事"],
  ["tech", "科技互联网", "新产品、新想法、新世界"],
  ["life", "生活杂谈", "把日常的小事说给你听"],
];
for (const c of categories)
  sql(
    `INSERT INTO categories(id,name,description) VALUES(${c.map(q).join(",")}) ON CONFLICT DO NOTHING`,
  );
const names = [
  "半颗西瓜",
  "周末放映员",
  "不加糖的拿铁",
  "像素漫游者",
  "晚风收藏家",
  "橘子汽水",
  "今天也想早睡",
  "路过的观察员",
];
const t = Date.now();
for (let i = 0; i < names.length; i++)
  sql(
    `INSERT INTO users(id,username,nickname,password,role,created_at) VALUES('demo-user-${i}','demo_${i}',${q(names[i])},'disabled:demo-account','member',${t - 30 * 86400000}) ON CONFLICT DO NOTHING`,
  );
const posts = [
  [
    "hot",
    "欢迎来到 🍉：这里有瓜，也有好好说话的人",
    "欢迎来到这个小小的互联网角落。\n\n这里可以聊新鲜事，也可以聊不那么新鲜但很重要的小事。带着好奇心来，带着一点新的想法离开。\n\n## 三个小约定\n- 讨论观点，不攻击彼此。\n- 分享信息时附上来源，让讨论有据可依。\n- 不必急着说服谁，认真听听不同的声音。\n\n**现在，先介绍一下你自己吧。最近有什么事，让你觉得“这一定得找个人聊聊”？**",
    0,
    1,
    1,
  ],
  [
    "hot",
    "如果一座城市每周有一天「慢下来」，你最想用来做什么？",
    "设想有这样一个周三：大家不赶进度，店铺晚一点开门，街角多几张长椅。\n\n我想先去吃一顿不看手机的早餐，再步行去那家一直路过、一直没进去的书店。\n\n这是一个虚构的城市生活提案。想听听你们：如果真的多出一天，你会怎么安排？",
    4,
    1,
    0,
  ],
  [
    "fun",
    "重看老电影才发现：让人记住的，往往不是结局",
    "周末翻出了收藏夹里的老片。以前只想知道故事往哪里走，这次却一直停在那些“没发生什么”的镜头上。\n\n厨房里的灯光、雨后的车站、一个人等电梯的半分钟。原来生活最有味道的部分，常常藏在这些空隙里。\n\n**哪一个电影里的小片段，你到现在还记得？** 不妨先不说片名，让大家猜一猜。",
    1,
    0,
    0,
  ],
  [
    "tech",
    "AI 帮你省下的时间，最后都去哪儿了？",
    "试着把琐碎任务交给工具一周后，我发现一个小问题：省下的时间，好像又被新的任务填满了。\n\n工具确实变快了，但生活未必。也许“效率”之后，还需要认真决定一次：我到底想把时间花在哪里？\n\n这不是产品评测，只是一个虚构的讨论场景。欢迎分享你的真实使用体验和小方法。",
    3,
    1,
    0,
  ],
  [
    "life",
    "花了一个下午，把阳台变成了我的「十分钟公园」",
    "两盆绿植、一张旧木凳、一杯没那么烫的咖啡。没有复杂的改造，只是把堆着的纸箱收拾掉，让阳光重新进来。\n\n现在每天回家，我会先在这里坐十分钟。什么也不做，看叶子动一动。\n\n你家里有没有一个这样的角落？\n\n> 配图是为演示制作的插画，不是真实用户照片。",
    2,
    0,
    0,
  ],
  [
    "hot",
    "一个问题：分享生活，是在记录，还是在等待被看见？",
    "整理相册时发现，那些没有发出去的照片反而更像我自己的生活。\n\n但收到朋友的一句“我也喜欢这里”，又确实会开心很久。记录和被看见之间，好像没有那么清楚的界线。\n\n你会为自己保留一些不公开的生活片段吗？",
    7,
    0,
    0,
  ],
  [
    "fun",
    "来交换一首适合傍晚散步听的歌吧",
    "今天下班，特意多走了两站路。天还亮着，风刚刚好。\n\n想做一个大家一起补充的散步歌单：留下一首歌名，再用一句话说说它适合什么样的傍晚。\n\n不需要歌词，也不需要排名，只交换心情。",
    5,
    0,
    0,
  ],
  [
    "tech",
    "手机里只留下 5 个 App，你会怎么选？",
    "最近做了一次“数字大扫除”。删了不少几个月没打开过的软件，却发现真正每天离不开的，也就是那几个。\n\n如果系统工具不算，只能选 5 个，你会留下哪些？\n\n可以按用途说，不必报品牌。我先来：聊天、地图、音乐、阅读、记事。",
    3,
    0,
    0,
  ],
  [
    "life",
    "你坚持最久的一个小习惯是什么？",
    "不是宏伟计划，也不用改变人生。\n\n比如睡前把桌子收拾干净，出门带一瓶水，每周给家人打个电话。\n\n我自己的习惯是每晚记下一件“今天还不错”的小事。写了一个月以后，慢慢发现日子没有想象中那么单调。",
    6,
    0,
    0,
  ],
  [
    "life",
    "周末早起去菜市场，比逛街还治愈",
    "蔬菜带着水珠，豆腐刚刚摆好，卖花的阿姨把最后一束小雏菊送给了隔壁摊主。\n\n这一刻突然觉得，生活的具体，比什么都好。\n\n你所在的地方，有没有值得慢慢逛的小市场？",
    4,
    0,
    0,
  ],
  [
    "fun",
    "如果把今天拍成电影，你会给它起什么名字？",
    "一个轻松的接龙。可以很长，也可以只有两个字。\n\n我的叫《咖啡凉了，事情还没做完》。想象它是一部低成本喜剧，片尾曲是回家的地铁报站声。\n\n轮到你了。",
    1,
    0,
    0,
  ],
  [
    "tech",
    "电子书和纸质书，你在什么场景下会选不同的那一本？",
    "出门时喜欢电子书的轻，周末在家又会想翻纸张。\n\n后来发现它们并不是竞争关系，更像两种不一样的阅读姿势。\n\n有没有一本书，你觉得一定要拿在手里看？",
    7,
    0,
    0,
  ],
];
for (let i = 0; i < posts.length; i++) {
  const [cat, title, body, author, featured, pinned] = posts[i],
    created = t - (i + 1) * 42 * 60000;
  sql(
    `INSERT INTO posts(id,user_id,category_id,title,body,featured,pinned,demo,created_at,updated_at) VALUES('demo-post-${i}','demo-user-${author}',${q(cat)},${q(title)},${q("【虚构演示内容】\n\n" + body)},${featured},${pinned},1,${created},${created}) ON CONFLICT DO NOTHING`,
  );
  for (let j = 0; j < (i % 5) + 2; j++) {
    const uid = (Number(author) + j + 1) % 8;
    sql(
      `INSERT INTO likes(post_id,user_id,created_at) VALUES('demo-post-${i}','demo-user-${uid}',${t - j * 60000}) ON CONFLICT DO NOTHING`,
    );
    const replies = [
      "很喜欢这个角度。比起寻找标准答案，听听不同的人怎么想就很有意思。",
      "我也有过类似的感觉。有时候慢一点，才能看见原来忽略的小事。",
      "来占一个位置，想看看大家会怎么聊。🍉",
      "认真读完了。今天就试着给自己留十分钟。",
      "谢谢分享，让普通的一天多了一点新想法。",
      "先收藏这个想法，下次和朋友散步时聊聊。",
    ];
    sql(
      `INSERT INTO replies(id,post_id,user_id,body,created_at) VALUES('demo-reply-${i}-${j}','demo-post-${i}','demo-user-${uid}',${q("（演示回复）" + replies[j % replies.length])},${created + (j + 1) * 60000}) ON CONFLICT DO NOTHING`,
    );
  }
}
mkdirSync(".sites-runtime/seed", { recursive: true });
const artworks = [
  {
    post: 4,
    author: 2,
    bg: "#e9e5d9",
    shapes:
      '<rect x="0" y="0" width="800" height="370" fill="#d8e1c8"/><rect x="70" y="35" width="450" height="330" fill="#eef0dc"/><path d="M295 35V365M70 195H520" stroke="#c4ccb4" stroke-width="12"/><path d="M0 500L800 340V600H0Z" fill="#d2c8ae"/><rect x="480" y="390" width="210" height="20" rx="5" fill="#a88768"/><path d="M510 410L490 590M650 410L675 590" stroke="#a88768" stroke-width="15"/><path d="M180 580V240" stroke="#6d8553" stroke-width="8"/><ellipse cx="137" cy="340" rx="60" ry="29" fill="#809767" transform="rotate(35 137 340)"/><ellipse cx="223" cy="290" rx="65" ry="30" fill="#95a879" transform="rotate(-35 223 290)"/><ellipse cx="140" cy="250" rx="54" ry="26" fill="#a3b184" transform="rotate(40 140 250)"/><path d="M115 440H245L228 585H135Z" fill="#c08c70"/><ellipse cx="588" cy="374" rx="36" ry="8" fill="#f7f3e4"/><path d="M555 340H620L612 376H563Z" fill="#fff9e9"/><ellipse cx="588" cy="342" rx="29" ry="6" fill="#8f775b"/>',
  },
  {
    post: 2,
    author: 1,
    bg: "#e9dfc9",
    shapes:
      '<rect x="95" y="70" width="610" height="420" rx="25" fill="#52644c"/><rect x="125" y="100" width="550" height="320" rx="10" fill="#e8e4c7"/><circle cx="440" cy="210" r="66" fill="#d5b67c"/><path d="M125 340Q280 210 400 340T675 300V420H125" fill="#9bab7e"/><path d="M125 380Q290 310 430 385T675 345V420H125" fill="#758c65"/><rect x="350" y="490" width="100" height="50" fill="#52644c"/><rect x="260" y="533" width="280" height="15" rx="7" fill="#52644c"/><circle cx="640" cy="456" r="8" fill="#c5d3a4"/>',
  },
];
for (const art of artworks) {
  const uid = "demo-image-" + art.post,
    file = `.sites-runtime/seed/${uid}.png`;
  await sharp(
    Buffer.from(
      `<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="600" fill="${art.bg}"/>${art.shapes}</svg>`,
    ),
  )
    .png()
    .toFile(file);
  wrangler([
    "r2",
    "object",
    "put",
    "site-creator-r2/" + uid,
    "--file",
    file,
    "--content-type",
    "image/png",
    "--local",
    "--config",
    "dist/server/wrangler.json",
    "--persist-to",
    ".wrangler/state",
  ]);
  sql(
    `INSERT INTO uploads(id,user_id,post_id,mime,created_at) VALUES(${q(uid)},'demo-user-${art.author}','demo-post-${art.post}','image/png',${t}) ON CONFLICT DO NOTHING`,
  );
}
writeFileSync(".sites-runtime/seed/data.sql", queries.join(";\n") + ";");
wrangler([
  "d1",
  "execute",
  "DB",
  "--local",
  "--config",
  "dist/server/wrangler.json",
  "--persist-to",
  ".wrangler/state",
  "--file",
  ".sites-runtime/seed/data.sql",
]);
console.log(
  "演示数据已就绪：12 个虚构话题、8 位虚构用户和 2 张原创插画。重复运行不会覆盖已有内容。",
);
