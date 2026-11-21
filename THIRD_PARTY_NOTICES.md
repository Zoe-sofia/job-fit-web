# 第三方组件声明

本项目内置以下开源组件（均已随仓库打包，运行时不访问 CDN）。它们的许可证与本项目自身的 MIT 许可相互独立，各自约束其自身的代码。

## pdf.js

- 版本：3.11.174
- 文件：`assets/vendor/pdf.min.js`、`assets/vendor/pdf.worker.min.js`
- 用途：在浏览器内解析文本型 PDF 简历
- 许可证：**Apache License 2.0**
- 版权：Copyright 2023 Mozilla Foundation
- 上游：<https://github.com/mozilla/pdf.js>
- 许可证全文：[LICENSES/Apache-2.0.txt](LICENSES/Apache-2.0.txt)

压缩文件头部保留了原始版权与许可声明，未做删改。

## mammoth

- 文件：`assets/vendor/mammoth.browser.min.js`
- 用途：将 DOCX 转换为 HTML/纯文本（本项目只用文本提取）
- 许可证：**BSD 2-Clause**
- 版权：Copyright (c) 2013, Michael Williamson
- 上游：<https://github.com/mwilliamson/mammoth.js>
- 许可证全文：[LICENSES/BSD-2-Clause-mammoth.txt](LICENSES/BSD-2-Clause-mammoth.txt)

## 合规说明

- Apache-2.0 要求保留版权、许可与免责声明——pdf.js 的压缩文件内已包含，仓库另附全文。
- BSD-2-Clause 要求在源码与二进制分发中保留上述版权声明——同上。
- 本项目**未修改**上述两个组件的源码，仅按原样引用。
- 本项目自身代码以 MIT 发布，不对上述组件重新授权。

## 字体与图标

界面无外部字体、无图标库。图标为 `index.html` 内联的 SVG symbol，favicon 为内联 data URI，均无第三方来源。
