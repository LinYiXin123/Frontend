(function globalFieldHelp() {
  "use strict";

  const POPOVER_ID = "global-field-help-popover";
  const TARGET_SELECTOR = [
    "th",
    '[role="columnheader"]',
    ".mapping-head > span",
    '[class*="table-head"] > span',
    '[class*="table-header"] > span',
    "label > span:first-child",
    "label:has(> input:first-child) > span",
    "label:not(:has(> span))",
    ".feishu-agent-form-label",
    ".schedule-form-field > span:first-child",
    ".ant-form-item-label > label",
    ".el-form-item__label",
    "legend",
  ].join(",");

  const commonTableRules = [
    ["数据范围", "显示当前账号权限、当前页面筛选和当前业务对象范围内的数据。"],
    ["更新规则", "业务记录保存、外部系统同步或状态计算完成后更新。"],
    ["空值含义", "为空、暂无或未配置表示当前没有可用记录，不等同于系统异常。"],
  ];

  const definitions = {
    project: {
      title: "项目",
      summary: "当前行或当前表单所对应的项目主记录，其他成员、仓库、证据、预警与运行数据都通过项目 ID 关联。",
      items: [["唯一标识", "以项目 ID 为关联主键，项目名称用于展示与搜索。"], ["数据来源", "来自项目档案；GitLab 导入项目会同时保留仓库路径。"], ["进入详情", "在支持跳转的列表中点击项目可进入同一项目详情。"]],
      note: "名称相同不代表同一项目，跨模块关联始终以项目 ID 为准。",
    },
    relation: {
      title: "负责人 / 参与人",
      summary: "展示项目成员关系，以及当前用户在项目中的负责人或参与人角色。",
      items: [["负责人", "对项目计划、进展补充、风险处理和结果闭环负责。"], ["参与人", "通过项目成员关系参与研发或协作。"], ["成员映射", "成员身份以系统成员目录和飞书映射结果为准。"]],
      note: "人员名称来自成员目录；同名成员通过用户 ID 区分。",
    },
    health: {
      title: "健康 / 静默",
      summary: "综合最近有效信号、预警规则和连续静默天数形成的项目推进状态。",
      items: [["正常", "最近两天存在有效推进信号，且没有高优先级未处理风险。"], ["关注 / 异常", "活跃下降、连续多日无信号，或存在需要跟进的规则命中。"], ["严重 / 停滞", "长期静默或关键风险未闭环，需要管理者介入。"], ["静默天数", "从最后一个有效硬性信号到当前日期的自然日差。"]],
      note: "健康状态是管理判断信号，不等同于代码质量、业务验收或运行监控状态。",
    },
    latestEvidence: {
      title: "最近信号",
      summary: "项目最近一次可追溯的推进证据，按时间从 GitLab、人工进展和运行记录中选取。",
      items: [["GitLab", "Commit、MR、Branch 或 Issue 等仓库活动。"], ["人工进展", "负责人补充的可追溯项目进展。"], ["运行监控", "最近一次有效运行探测结果。"], ["时间", "显示证据发生时间，不使用列表加载时间替代。"]],
      note: "没有信号时会明确显示暂无可追溯信号，不用模拟数据补位。",
    },
    rhythm: {
      title: "当前范围节奏",
      summary: "把当前时间范围内的项目证据按日期排列，用于快速判断推进是否连续。",
      items: [["节点", "每个节点代表当天至少一类有效证据。"], ["颜色", "颜色区分 GitLab、人工进展、运行或预警来源。"], ["联动", "点击节点会用同一项目 ID 和日期筛选关联列表。"]],
      note: "节奏反映证据分布，不直接等于工作量或完成百分比。",
    },
    runtime: {
      title: "运行态",
      summary: "项目已配置运行检查的最近一次有效探测结果。",
      items: [["健康", "启用的检查最近一次探测正常。"], ["降级 / 故障", "最近一次探测存在异常，需要进入运行监控处理。"], ["待探测", "已配置检查，但尚未形成有效结果。"], ["未监控", "当前没有启用任何运行检查。"]],
      note: "运行态来自健康检查，不由 GitLab 活跃度或人工进展推断。",
    },
    completeness: {
      title: "数据完整度",
      summary: "衡量项目基础关系是否补齐，不代表开发进度、代码质量或交付完成率。",
      formula: "得分 = 已满足维度数 ÷ 4 × 100%（每项 25%）",
      items: [["负责人", "已关联成员目录中的有效负责人。"], ["GitLab", "已绑定可识别的 GitLab 仓库。"], ["飞书映射", "负责人或参与人中至少一名在职成员已完成飞书映射；映射完成不等于具备接收资格。"], ["活动证据", "已有最近活动时间，或采集到 GitLab、人工、运行等项目证据。"]],
      note: "缺失项应在成员映射、GitLab 集成或项目进展中补齐。",
    },
    nextAction: {
      title: "下一步行动",
      summary: "根据当前项目最需要闭环的预警、决策、里程碑或数据缺口生成的建议动作。",
      items: [["优先顺序", "高优先级预警和阻塞项优先，其次是里程碑与数据补齐。"], ["动作来源", "来自规则命中、待决策项、临近里程碑或关联数据缺口。"], ["完成方式", "进入对应业务页面处理后，动作状态会随真实记录更新。"]],
      note: "建议动作不自动代替负责人决策；处理结果需要形成可追溯记录。",
    },
    account: {
      title: "账户",
      summary: "成员在当前集成系统中的可识别账号，用于同步活动和建立人员映射。",
      items: [["身份来源", "来自 GitLab、飞书或系统成员目录中的账号标识。"], ["关联规则", "通过用户 ID、邮箱或人工确认映射到系统成员。"], ["未识别", "无法可靠匹配时保留为待映射，不自动合并同名账号。"]],
      note: "账号与真实人员的对应关系以成员映射页面确认结果为准。",
    },
    source: {
      title: "来源",
      summary: "说明当前记录由哪个系统、业务流程或人工操作产生。",
      items: [["外部同步", "例如 GitLab、飞书或运行监控接口采集。"], ["系统生成", "由规则计算、业务流程或 Agent 动作形成。"], ["人工录入", "由有权限的成员提交并保留记录人和时间。"]],
      note: "来源用于追溯，不同来源的数据仍需通过业务主键关联。",
    },
    role: {
      title: "角色",
      summary: "成员在当前项目、群空间或系统中的职责、权限范围和消息接收资格。",
      items: [["项目角色", "负责人负责闭环，参与人负责协作。"], ["系统角色", "系统角色分为管理员、普通成员和内测用户。"], ["飞书接收", "管理员和普通成员可真实接收飞书消息；内测用户不接收任何飞书提醒、消息或机器人通知。"], ["更新", "角色变化后按最新成员关系和权限重新计算。"]],
      note: "角色名称相同不代表跨项目拥有相同的数据权限。",
    },
    department: {
      title: "部门",
      summary: "成员所属的组织部门，用于成员筛选、责任归属和可见范围判断。",
      items: [["数据来源", "以飞书通讯录或系统成员目录中的当前部门为准。"], ["多部门", "存在多个部门时保留全部有效归属。"], ["离职 / 停用", "成员状态变化后不再作为新的负责人候选。"]],
      note: "组织变更需要完成通讯录同步后才会更新。",
    },
    mapping: {
      title: "映射状态",
      summary: "表示外部账号是否已经与系统成员目录中的唯一成员建立可信关联。",
      items: [["已映射", "外部用户 ID 已关联到一个有效系统成员。"], ["待确认", "存在候选成员，但需要人工确认。"], ["未映射", "尚未找到可靠成员关系。"], ["冲突", "同一账号或成员出现多个互斥候选，需要处理。"]],
      note: "映射完成后，项目负责人和代码活动才能正确归属到同一人；飞书消息是否接收仍由系统角色决定。",
    },
    sync: {
      title: "同步信息",
      summary: "记录外部数据最近一次同步结果、时间以及需要处理的异常。",
      items: [["成功", "最近一次同步完成并写入有效数据。"], ["延迟", "同步尚未完成或数据源暂未返回最新结果。"], ["失败", "接口、权限或数据校验失败，需要重新同步或修复配置。"]],
      note: "同步时间不等同于业务数据发生时间。",
    },
    date: {
      title: "计划日期",
      summary: "业务事项计划开始、完成或验收的日期，用于里程碑提醒和逾期判断。",
      items: [["日期口径", "按当前系统时区的自然日保存。"], ["逾期判断", "超过计划完成日期且事项未完成时标记逾期。"], ["变更留痕", "已生效计划修改日期时，需要填写变更原因并生成新版本。"]],
      note: "日期调整不会删除历史计划版本。",
    },
    owner: {
      title: "负责人",
      summary: "对当前项目、里程碑、动作或任务的推进和结果闭环负责的成员。",
      items: [["候选范围", "仅允许选择成员目录中的有效在职成员。"], ["责任", "负责补充进展、处理风险并确认结果。"], ["通知", "管理员或普通成员具备飞书映射且在应用可用范围内时可真实接收提醒；内测用户不接收。"]],
      note: "负责人变更会保留历史记录，不会改写已产生证据的记录人。",
    },
    acceptance: {
      title: "验收标准",
      summary: "用于判断里程碑、任务或交付是否真正完成的可验证条件。",
      items: [["可验证", "描述可检查的结果、指标、链接或证据。"], ["可复核", "其他成员能够根据同一标准得到一致结论。"], ["状态关系", "仅填写标准不会自动完成事项，需要提交结果或验收结论。"]],
      note: "避免使用“基本完成”“差不多”等无法复核的表述。",
    },
    weight: {
      title: "里程碑占比",
      summary: "当前里程碑在项目计划中的相对权重，用于汇总项目整体计划进度。",
      formula: "里程碑进度贡献 = 里程碑完成度 × 归一化权重",
      items: [["相对权重", "数值越高，对项目整体进度影响越大。"], ["归一化", "系统会按同一项目所有里程碑权重换算为占比。"], ["历史", "权重变更随计划版本保留。"]],
      note: "权重不是工时，也不代表里程碑的业务优先级。",
    },
    scope: {
      title: "访问范围",
      summary: "限制当前群空间、Agent 或集成功能可以读取和操作的数据边界。",
      items: [["仅绑定项目", "只读取所选项目及其关联仓库、成员和证据。"], ["全系统", "按当前账号权限读取系统范围数据，仅管理员可配置。"], ["最小权限", "默认优先选择能够完成任务的最小数据范围。"]],
      note: "访问范围不会突破当前登录账号和应用本身的数据权限。",
    },
    command: {
      title: "校验命令",
      summary: "Agent 完成修改后必须执行的项目校验命令，使用 JSON 参数数组保存。",
      items: [["格式", "每条命令使用参数数组，例如 [\"npm\", \"test\"]。"], ["执行", "按列表顺序运行；失败时进入修复或人工处理。"], ["安全", "只允许项目策略允许的命令和工作目录。"]],
      note: "命令配置错误会阻止 Agent 任务完成验收。",
    },
    limit: {
      title: "变更限制",
      summary: "约束 Agent 自动修改的最大范围，避免任务偏离目标或一次变更过大。",
      items: [["文件数", "限制一次任务最多允许修改的文件数量。"], ["行数", "限制新增、删除和修改的总行数。"], ["超限", "超过策略限制时停止自动提交并转为人工确认。"]],
      note: "限制应结合项目规模设置，不建议为了通过任务临时无限放大。",
    },
    description: {
      title: "需求描述",
      summary: "说明本次需求的目标、范围、约束和可验收结果，是计划生成和执行判断的主要输入。",
      items: [["目标", "说明要解决的问题和期望业务结果。"], ["范围", "写清包含与不包含的功能或数据。"], ["验收", "给出可以复核的完成条件。"]],
      note: "描述越具体，Agent 计划、风险识别和执行证据越可靠。",
    },
    requester: {
      title: "需求方",
      summary: "提出项目目标、业务问题或验收诉求的部门或成员，用于明确价值来源和验收协作关系。",
      items: [["责任边界", "需求方确认业务目标与验收口径，项目负责人负责推进和结果闭环。"], ["关联", "同一需求方可关联多个项目，但项目仍以项目 ID 独立管理。"], ["变更", "需求方变更会保留历史档案和既有证据。"]],
      note: "需求方不是项目负责人，也不自动获得项目管理权限。",
    },
    scale: {
      title: "预期规模",
      summary: "登记阶段对项目投入周期和协作复杂度的初步判断，用于安排管理节奏和计划粒度。",
      items: [["短周期", "适合用少量里程碑管理的快速验证或小范围交付。"], ["中长周期", "需要更完整的计划、责任人、阶段验收和风险跟踪。"], ["调整", "建立正式计划后，应以里程碑日期和权重为准。"]],
      note: "预期规模不是承诺工期，也不直接计算项目完成率。",
    },
    activityType: {
      title: "类型",
      summary: "标识当前证据或记录所属的业务类别，用于筛选、统计和规则计算。",
      items: [["代码活动", "Commit、MR、Branch 或 Issue 等 GitLab 记录。"], ["业务活动", "人工进展、运行监控或预警处置记录。"], ["统计", "同一条记录只按其真实来源类型计入，避免重复计算。"]],
      note: "类型用于分类，不代表重要程度或处理优先级。",
    },
    activityContent: {
      title: "动态内容",
      summary: "当前活动证据的可读摘要，帮助判断项目发生了什么变化。",
      items: [["原始信息", "保留外部系统或人工记录中的关键描述。"], ["关联", "通过项目 ID、记录 ID 和发生时间关联到项目证据链。"], ["详情", "需要核实时应进入原始记录或关联链接。"]],
      note: "摘要可能被截断，完整内容以详情中的原始记录为准。",
    },
    branch: {
      title: "分支",
      summary: "GitLab 活动所属的仓库分支，用于区分主线、功能分支和交付来源。",
      items: [["默认分支", "由仓库配置提供，通常作为主线活动和扫描基线。"], ["功能分支", "用于关联具体研发活动，不自动代表已经合并或发布。"], ["空值", "外部记录未返回分支，或当前证据类型不适用分支。"]],
      note: "分支更新是活跃信号之一，但不等于功能完成或已经上线。",
    },
    timeId: {
      title: "时间 / ID",
      summary: "记录发生时间和唯一记录标识，用于排序、去重和追溯原始数据。",
      items: [["发生时间", "优先使用业务记录真实发生时间，而不是同步时间。"], ["记录 ID", "用于避免重复入库，并关联详情或外部原始记录。"], ["时区", "页面按当前系统时区展示。"]],
      note: "同步延迟不会改写原始记录的发生时间。",
    },
    integration: {
      title: "仓库 / 集成地址",
      summary: "项目关联的 GitLab 实例、仓库路径或外部集成标识，用于同步真实项目活动。",
      items: [["实例地址", "填写项目实际所在的 GitLab 服务地址。"], ["项目路径", "使用 group/project 路径或可验证的项目 ID。"], ["校验", "保存后需通过接口权限和项目可访问性检查。"]],
      note: "同名仓库仍按实例地址和项目 ID 区分，不自动合并。",
    },
    chat: {
      title: "飞书群信息",
      summary: "用于把群聊空间与项目、Agent 策略及消息触达范围建立关联。",
      items: [["群名称", "用于管理界面识别，不作为唯一主键。"], ["Chat ID", "飞书群聊的唯一标识，仅用于读取入站上下文，不用于真实群外发。"], ["权限", "群必须位于应用可用范围内，且机器人已具备所需读取权限。"]],
      note: "群名称可重复，系统关联以飞书 Chat ID 为准。",
    },
    range: {
      title: "统计范围",
      summary: "限定当前图表、矩阵或列表参与计算的时间和数据范围。",
      items: [["时间范围", "只统计所选日期区间内发生的真实记录。"], ["页面筛选", "与项目、来源、健康状态等筛选条件共同生效。"], ["联动", "范围变化后图表、汇总和关联列表使用同一结果集重新计算。"]],
      note: "切换范围只改变当前视图，不修改原始业务数据。",
    },
    priority: {
      title: "等级 / 优先级",
      summary: "表示问题、风险或动作的处理紧迫度，用于排序和确定响应顺序。",
      items: [["等级来源", "由规则命中、影响范围和业务状态计算，或由有权限成员确认。"], ["处理顺序", "高等级问题优先处理；同等级时再按发生时间和项目影响排序。"], ["变化", "证据或处置状态更新后可以重新计算。"]],
      note: "优先级不是项目价值评分，也不替代负责人对实际影响的判断。",
    },
    recordState: {
      title: "状态",
      summary: "当前业务记录在所属流程中的阶段或处理结果。",
      items: [["当前值", "由真实业务记录和最近一次有效操作产生。"], ["流转", "只有完成对应操作或满足规则后才进入下一状态。"], ["历史", "状态变化保留操作人、时间和相关证据。"]],
      note: "不同模块的同名状态口径可能不同，应以浮层中的当前业务对象为准。",
    },
    action: {
      title: "动作 / 结论",
      summary: "记录复盘、预警或任务需要执行的下一步动作及责任闭环信息。",
      items: [["动作", "写清具体要做什么，以及完成后的可验证结果。"], ["负责人", "指定对动作完成负责的有效成员。"], ["完成日期", "用于提醒和逾期判断。"], ["结论", "保留本期证据、判断依据和最终结论。"]],
      note: "保存后会形成可追溯记录，不应使用无责任人或无完成条件的空泛表述。",
    },
    qualityRepository: {
      title: "GitLab 关联",
      summary: "表示项目是否已关联到可访问的 GitLab 仓库，用于同步仓库动态并建立可追溯的运行证据链。",
      items: [["已关联", "项目已保存 GitLab 实例与项目标识，并可识别默认分支。"], ["待关联", "尚未形成可靠仓库映射，无法持续同步真实仓库动态。"], ["关联主键", "使用项目 ID 关联项目档案，以 GitLab 项目标识定位仓库，不按名称猜测。"]],
      note: "关联状态只说明仓库映射是否可用；项目运行判断仍以实际同步到的仓库与运行证据为准。",
    },
    qualityCoverage: {
      title: "扫描完整度",
      summary: "反映本次扫描计划要求的质量引擎是否全部完成，并形成可追溯结果。",
      items: [["完整", "必需引擎完成，扫描范围、版本和结果均已记录。"], ["不完整", "至少一个必需引擎失败、缺失或未返回可用证据。"], ["进行中", "任务已进入队列或正在执行，尚不能用于质量判断。"]],
      note: "扫描不完整时不输出可用质量分，也不能把缺失结果视为零问题。",
    },
    qualityAssurance: {
      title: "证据覆盖",
      summary: "衡量当前报告对项目技术栈所需质量维度和引擎证据的覆盖程度。",
      items: [["覆盖率", "按当前项目画像、策略版本和必需引擎计算，不是代码覆盖率。"], ["100%", "当前策略要求的证据维度均已形成有效结果。"], ["待补齐", "仍有必需证据缺口，需要补装工具、修复配置或重新扫描。"]],
      note: "覆盖率只描述证据是否齐全；问题严重度和门禁结论需结合具体发现判断。",
    },
    qualityReview: {
      title: "人工复核",
      summary: "展示扫描发现中仍需人工确认、风险接受到期或尚未闭环的治理事项。",
      items: [["待复核", "扫描证据已形成，但仍需负责人确认真实影响或修复结论。"], ["已闭环", "当前报告没有待处理的人工治理事项。"], ["到期重开", "限期接受风险已到期，问题自动重新进入门禁与处置队列。"]],
      note: "确认误报和风险接受不会删除原始发现，所有状态变化保留追加式审计记录。",
    },
  };

  const aliases = {
    "项目": "project", "项目/日期": "project", "项目名称": "project", "关联项目": "project", "绑定项目": "project", "策略项目": "project",
    "负责人/参与人": "relation", "我的角色/团队": "relation", "成员": "relation", "参与人": "relation",
    "健康/静默": "health", "健康/静默天数": "health", "健康状态": "health", "项目健康": "health",
    "最近信号": "latestEvidence", "最新证据": "latestEvidence", "信号": "latestEvidence", "活动证据": "latestEvidence",
    "当前范围节奏": "rhythm", "推进节奏": "rhythm", "活跃趋势": "rhythm",
    "运行态": "runtime", "运行监控": "runtime", "运行状态": "runtime", "健康检查": "runtime",
    "数据完整度": "completeness", "完整度": "completeness",
    "下一步": "nextAction", "下一步行动": "nextAction", "操作": "nextAction",
    "账户": "account", "账号": "account", "GitLab账号": "account", "飞书账号": "account",
    "来源": "source", "信号来源": "source", "数据来源": "source",
    "角色": "role", "权限角色": "role", "部门": "department", "所属部门": "department",
    "映射状态": "mapping", "成员映射": "mapping", "同步信息": "sync", "同步状态": "sync", "最近同步": "sync",
    "计划日期": "date", "计划开始": "date", "计划结束": "date", "计划完成日期": "date", "截止日期": "date", "变更原因": "date",
    "负责人": "owner", "项目负责人": "owner", "动作负责人": "owner", "记录人": "owner",
    "验收标准": "acceptance", "里程碑占比": "weight", "权重": "weight",
    "访问范围": "scope", "校验命令(JSON参数数组)": "command", "校验命令": "command",
    "自动修复次数": "limit", "最多修改文件": "limit", "最多变更行数": "limit", "必须配置并通过项目校验": "limit",
    "需求描述": "description", "项目简介": "description",
    "一句话描述": "description", "需求方": "requester", "预期规模": "scale",
    "类型": "activityType", "动态内容": "activityContent", "分支": "branch", "时间/ID": "timeId",
    "GitLab地址": "integration", "项目ID/路径": "integration", "仓库": "integration", "GitLab仓库": "integration",
    "群名称": "chat", "飞书ChatID": "chat",
    "时间范围": "range", "统计范围": "range", "矩阵时间范围": "range", "矩阵证据来源": "source", "矩阵排序方式": "range",
    "角色/部门": "relation", "GitLab": "integration", "飞书": "mapping",
    "等级": "priority", "优先级": "priority", "状态": "recordState", "文件位置": "source", "问题": "activityContent",
    "下一步动作": "action", "本期复盘结论": "action", "处置依据": "action", "风险接受到期日": "action",
    "GitLab关联": "qualityRepository", "扫描完整度": "qualityCoverage", "证据覆盖": "qualityAssurance", "人工复核": "qualityReview",
  };

  function compact(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeLabel(value) {
    return compact(value)
      .replace(/[：:*＊]/g, "")
      .replace(/\s*（.*?）\s*$/, "")
      .replace(/\s*\(.*?\)\s*$/, "")
      .replace(/\s+/g, "")
      .slice(0, 64);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function icon(name) {
    return `<i data-global-help-icon="${escapeHtml(name)}" aria-hidden="true"></i>`;
  }

  function hydrateIcons(scope) {
    const runtime = window.LegacyQualityIcons;
    if (!runtime || typeof runtime.createIcons !== "function") return;
    runtime.createIcons({
      root: scope || document,
      nameAttr: "data-global-help-icon",
      icons: runtime.icons,
      attrs: { width: 14, height: 14, "stroke-width": 1.8 },
    });
  }

  function labelText(host) {
    const clone = host.cloneNode(true);
    clone.querySelectorAll("input,select,textarea,button,svg,small,.global-field-help-trigger").forEach((node) => node.remove());
    return compact(clone.textContent)
      .replace(/\s*[（(]?必填[）)]?\s*$/u, "")
      .replace(/\s*[＊*]\s*$/u, "")
      .slice(0, 64);
  }

  function isTableHeader(host) {
    return host.matches("th,[role='columnheader'],.mapping-head > span,[class*='table-head'] > span,[class*='table-header'] > span");
  }

  function isEligible(host, label) {
    if (!label || label.length > 64) return false;
    if (host.closest(`#${POPOVER_ID},.mine-field-popover`)) return false;
    if (host.closest(".mine-matrix-panel")) return false;
    if (host.matches("[aria-hidden='true']")) return false;
    if (host.querySelector(".mine-field-help")) return false;
    if (isTableHeader(host) && !compact(label)) return false;
    return true;
  }

  function fallbackDefinition(label, context) {
    const objectName = context === "table" ? "当前列表记录" : "当前表单对象";
    return {
      title: label,
      summary: `「${label}」用于描述${objectName}的对应业务信息。`,
      items: commonTableRules,
      note: "具体结果受当前账号权限、页面筛选范围和最近一次有效同步时间影响。",
    };
  }

  function definitionFor(label, context) {
    const key = aliases[normalizeLabel(label)];
    const definition = key && definitions[key];
    return definition || fallbackDefinition(label, context);
  }

  function ensurePopover() {
    let popover = document.getElementById(POPOVER_ID);
    if (popover) return popover;
    popover = document.createElement("section");
    popover.id = POPOVER_ID;
    popover.className = "global-field-help-popover";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-modal", "false");
    popover.setAttribute("aria-labelledby", "global-field-help-title");
    popover.setAttribute("aria-hidden", "true");
    document.body.appendChild(popover);
    return popover;
  }

  function renderPopover(meta) {
    return `<header><div><span>字段说明</span><h2 id="global-field-help-title">${escapeHtml(meta.title)}</h2></div><button type="button" class="global-field-help-close" aria-label="关闭字段说明">${icon("X")}</button></header>
      <p class="global-field-help-summary">${escapeHtml(meta.summary)}</p>
      ${meta.formula ? `<div class="global-field-help-formula">${icon("Calculator")}<strong>${escapeHtml(meta.formula)}</strong></div>` : ""}
      <div class="global-field-help-groups"><section><h3>口径与规则</h3><dl>${meta.items.map(([term, description]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(description)}</dd></div>`).join("")}</dl></section></div>
      <footer>${icon("Info")}<span>${escapeHtml(meta.note)}</span></footer>`;
  }

  let activeTrigger = null;
  let placementScheduled = false;

  function positionPopover(trigger, popover) {
    if (!(trigger instanceof HTMLElement) || !trigger.isConnected || !popover?.classList.contains("is-open")) return;
    const triggerRect = trigger.getBoundingClientRect();
    const popoverWidth = popover.offsetWidth;
    const popoverHeight = popover.offsetHeight;
    const gap = 8;
    const edge = 12;
    const left = Math.min(
      Math.max(edge, triggerRect.right - popoverWidth),
      window.innerWidth - popoverWidth - edge,
    );
    const below = triggerRect.bottom + gap;
    const fitsBelow = below + popoverHeight <= window.innerHeight - edge;
    const top = fitsBelow
      ? below
      : Math.max(edge, triggerRect.top - popoverHeight - gap);
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
    popover.dataset.placement = fitsBelow ? "below" : "above";
  }

  function schedulePopoverPosition() {
    if (placementScheduled || !activeTrigger) return;
    placementScheduled = true;
    window.requestAnimationFrame(() => {
      placementScheduled = false;
      if (!activeTrigger?.isConnected) {
        closePopover(false);
        return;
      }
      positionPopover(activeTrigger, document.getElementById(POPOVER_ID));
    });
  }

  function closePopover(restoreFocus) {
    const popover = document.getElementById(POPOVER_ID);
    if (!popover || !popover.classList.contains("is-open")) return;
    const trigger = document.querySelector('.global-field-help-trigger[aria-expanded="true"]');
    popover.classList.remove("is-open");
    popover.setAttribute("aria-hidden", "true");
    document.querySelectorAll(".global-field-help-trigger").forEach((button) => button.setAttribute("aria-expanded", "false"));
    activeTrigger = null;
    if (restoreFocus && trigger instanceof HTMLElement) trigger.focus();
  }

  function closeLegacyHelp() {
    document.querySelectorAll(".mine-field-popover.is-open").forEach((popover) => {
      popover.classList.remove("is-open");
      popover.setAttribute("aria-hidden", "true");
    });
    document.querySelectorAll('.mine-field-help[aria-expanded="true"]').forEach((button) => button.setAttribute("aria-expanded", "false"));
  }

  function openPopover(trigger) {
    const label = trigger.dataset.fieldLabel || "字段";
    const context = trigger.dataset.fieldContext || "form";
    const popover = ensurePopover();
    const wasOpen = trigger.getAttribute("aria-expanded") === "true";
    closePopover(false);
    closeLegacyHelp();
    if (wasOpen) return;
    popover.innerHTML = renderPopover(definitionFor(label, context));
    popover.classList.add("is-open");
    popover.setAttribute("aria-hidden", "false");
    trigger.setAttribute("aria-expanded", "true");
    activeTrigger = trigger;
    hydrateIcons(popover);
    positionPopover(trigger, popover);
    popover.querySelector(".global-field-help-close")?.focus();
  }

  function createTrigger(host, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "global-field-help-trigger";
    button.dataset.fieldLabel = label;
    button.dataset.fieldContext = isTableHeader(host) ? "table" : "form";
    button.setAttribute("aria-label", `查看${label}字段说明`);
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", POPOVER_ID);
    button.innerHTML = icon("Info");
    return button;
  }

  function wrapDirectLabelText(host) {
    const wrapper = document.createElement("span");
    wrapper.className = "global-field-help-label-text";
    while (host.firstChild) {
      const node = host.firstChild;
      const isLeadingText = node.nodeType === Node.TEXT_NODE;
      const isRequiredMarker = node instanceof Element && node.matches("em,strong,b");
      if (!isLeadingText && !isRequiredMarker) break;
      wrapper.appendChild(node);
    }
    host.insertBefore(wrapper, host.firstChild);
    return wrapper;
  }

  function enhanceHost(host) {
    if (!(host instanceof HTMLElement)) return false;
    const label = labelText(host);
    if (!isEligible(host, label)) return false;
    const existing = host.querySelector(":scope > .global-field-help-trigger");
    if (existing) {
      if (existing.dataset.fieldLabel !== label) {
        existing.dataset.fieldLabel = label;
        existing.setAttribute("aria-label", `查看${label}字段说明`);
      }
      return false;
    }
    const trigger = createTrigger(host, label);
    host.dataset.globalFieldHelpHost = "true";
    if (isTableHeader(host)) host.classList.add("global-field-help-table-header");
    if (host.matches("label") && !host.querySelector(":scope > span:first-child")) {
      host.classList.add("global-field-help-direct-label");
      wrapDirectLabelText(host).appendChild(trigger);
    } else {
      host.classList.add("global-field-help-inline-label");
      const small = host.querySelector(":scope > small:first-of-type");
      if (small) host.insertBefore(trigger, small);
      else host.appendChild(trigger);
    }
    return true;
  }

  function enhanceAll() {
    let inserted = 0;
    document.querySelectorAll(TARGET_SELECTOR).forEach((host) => {
      if (enhanceHost(host)) inserted += 1;
    });
    if (inserted) hydrateIcons(document);
  }

  let scheduled = false;
  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      enhanceAll();
    });
  }

  document.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".global-field-help-trigger")) event.preventDefault();
  }, true);

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest(".global-field-help-trigger");
    if (trigger) {
      event.preventDefault();
      event.stopPropagation();
      openPopover(trigger);
      return;
    }
    if (event.target.closest(".global-field-help-close")) {
      event.preventDefault();
      event.stopPropagation();
      closePopover(true);
      return;
    }
    if (!event.target.closest(`#${POPOVER_ID}`)) closePopover(false);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.getElementById(POPOVER_ID)?.classList.contains("is-open")) {
      event.preventDefault();
      closePopover(true);
    }
  }, true);

  document.addEventListener("scroll", schedulePopoverPosition, { capture: true, passive: true });
  window.addEventListener("resize", schedulePopoverPosition, { passive: true });

  ensurePopover();
  enhanceAll();
  new MutationObserver(scheduleEnhance).observe(document.body, { childList: true, subtree: true, characterData: true });
})();
