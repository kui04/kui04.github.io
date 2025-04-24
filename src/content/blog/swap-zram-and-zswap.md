---
title: "swap, zram 和 zswap 的对比及使用场景"
description: "在 Linux 系统中，为防止内存不足导致系统崩溃，我们通常会使用一些内存扩展技术，如 swap、zram 和 zswap。下面我们简单介绍它们的原理、适用场景以及如何开启和配置它们。"
pubDate: "2025 04 08"
tags: ["Linux"]
---

### swap

swap 通过在磁盘上创建创建分区或者文件，将暂时不活跃的内存页移动到磁盘。当物理内存耗尽时，系统会将部分内存数据换出到磁盘，需要时再换入。这种机制可以防止系统因内存不足而崩溃，但由于硬盘 I/O 速度远低于内存，因此过度使用 swap 会导致系统性能下降。

swap 适用于临时需要大量内存的情景，swap 也用于系统休眠（Hibernate），但是需要 swap 大小**至少与内存等大**。

部分 Linux 发行版默认可能已经配置了 swap 分区或文件。如果需要手动设置，可以通过以下步骤创建一个 swap 文件：

```bash
# 创建一个大小为 4G 的 swap 文件
sudo dd if=/dev/zero of=/swapfile bs=1M count=4096 status=progress

# 因为是内存数据，我们需要设置合适的权限加以限制。
sudo chmod 600 /swapfile

# 格式化为 swap
sudo mkswap /swapfile

# 启用 swap
sudo swapon /swapfile

# 如果你想要每次开机都自动启动这个 swap 文件， 在 /etc/fstab 中为交换文件添加一个条目
echo '/swapfile none swap defaults 0 0' | sudo tee -a /etc/fstab

```

### zram

zram 是一个 Linux 内核模块，它在内存中创建压缩的块设备（/dev/zram<id>），即带实时磁盘压缩的内存盘，**被用作 swap**。在最开始，创建出的 zram 块设备并不会预留或使用任何内存。zram 块设备将会根据需要动态地增长或收缩。

zram 通过压缩数据来增加有效的内存空间，同时保持快速的 I/O 性能。相比传统的 swap，zram 不依赖硬盘，因此速度更快。也因此在 Android 移动设备中使用广泛，最近各大厂商所谓的内存扩容，很可能是下文中的 zswap。 需要注意的是 zram 的压缩过程会一定程度增加 CPU 的负担。

Ubuntu 中可以通过安装 [zram-config](https://github.com/ecdye/zram-config) 包来轻松启用 zram， 系统会自动在开机时启用 zram，无需额外配置，其他 Linux 发行版可以参考对应的文档。

> **注意：zswap 和 zram 二者不可共存，使用 zram 时一定要关闭 zswap**

常见的压缩算法对比

| 算法          | 速度     | 压缩率         | CPU 开销 | 适用场景                                              |
| ------------- | -------- | -------------- | -------- | ----------------------------------------------------- |
| lzo / lzo-rle | 非常快   | 中等（2~3 倍） | 较低     | 默认选择、需要低延迟、高效实时压缩                    |
| lz4           | 极快     | 稍低           | 很低     | 对延迟极为敏感、CPU 限制较紧                          |
| zstd          | 中等偏快 | 较高           | 中等偏上 | 需要更高压缩率、并能在速度与比率间调节                |
| zlib/deflate  | 较慢     | 最高           | 较高     | 非实时应用、对压缩率要求极致且 CPU 开销不是问题的场景 |

### zswap

zswap 是一种轻量级的压缩缓存，用于缓存即将被交换出的内存页。当 swap 触发时：数据先被压缩存入 zswap 缓存，若缓存已满，最近最少使用（LRU）的数据被写入传统 swap，很适合普通办公电脑。

zswap 默认可能已经启用，可以通过下面的命令查看开启情况

```bash
cat /sys/module/zswap/parameters/enabled
```

手动开启 zswap 前需要取保内核配置启用了 zswap，看到 `CONFIG_ZSWAP=y` 就说明启用了

```bash
cat /boot/config-`uname -r` | grep -i zswap
```

然后我们需要修改内核启动参数来开启 zswap，使用你熟悉的编辑器打开 `/etc/default/grub`，在 `GRUB_CMDLINE_LINUX_DEFAULT` 中添加 `zswap.enabled=1` 等参数，例如：

```bash
# 开启 zswap, 使用压缩算法 LZ4, 压缩存储池分配器 zsmalloc
GRUB_CMDLINE_LINUX_DEFAULT="quiet splabash zswap.enabled=1 zswap.compressor=lz4 zswap.zpool=zsmalloc"
```

更新 Grub 并 重启

```bash
sudo update-grub
sudo reboot
```

查看相关内核日志

```bash
sudo dmesg | grep zswap
```

### 参考资料

- [ArchWiki swap](https://wiki.archlinux.org/title/swap)
- [ArchWiki zram](https://wiki.archlinux.org/title/zram)
- [ArchWiki zswap](https://wiki.archlinux.org/title/zswap)
- [Enable zswap to increase performance](https://ubuntu-mate.community/t/enable-zswap-to-increase-performance/11302)
- [Enable lz4 compression](https://askubuntu.com/questions/877178/enabling-lz4-compression-in-zswap-ie-making-zswap-more-efficient/877322#877322)
